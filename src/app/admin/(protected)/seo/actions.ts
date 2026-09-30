"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { ContentKind, SeoTargetType } from "@/generated/prisma/client";
import { uploadImage } from "@/lib/media/bunny";
import { allowedImage, renderMarkdown } from "@/lib/seo/markdown";
import { DEALER_WORDING } from "@/lib/seo/dealer-wording";
import { MOVED } from "@/lib/seo/moved-paths";
import { validateRedirect } from "@/lib/seo/redirect-rules";
import { fetchOwnPage } from "@/lib/seo/own-page";
import { siteOrigin, siteOriginConfigured } from "@/lib/seo/urls";
import { contentChecks, jsonLdBlocks, type Check, type JsonLdBlock } from "@/lib/seo/seo-checks";
import { brokenLinks, brokenLinksIn, saveOverride, type ArticleForm, type OverrideForm } from "@/lib/seo/admin-data";
import { createManualResolver } from "@/lib/seo/manual-redirects";
import { createMagentoResolver, type MagentoTable } from "@/lib/seo/magento-redirects";
import { setSetting } from "@/lib/settings/settings";

/**
 * Server actions of «SEO & Περιεχόμενο». Each one checks the capability itself
 * (a server action is a public endpoint) and writes the admin audit log.
 */

async function guard(edit = true) {
  const session = await auth();
  assertCan(session?.user.role, edit ? "seo.edit" : "seo.view");
  return session!.user;
}

type User = Awaited<ReturnType<typeof guard>>;

function audit(user: User, action: string, entity: string, entityId: string, diff: Record<string, unknown>) {
  return prisma.adminAuditLog.create({
    data: { userId: user.id, action, entity, entityId: entityId.slice(0, 255), diff: diff as object },
  });
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS: readonly ContentKind[] = ["ARTICLE", "GUIDE"];

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ── Input validation ────────────────────────────────────────────────────────
// Server actions are public endpoints: every input is checked for type and
// length here, whatever the form in the browser allowed.

const text = (max: number) => z.string().max(max);
const faqSchema = z.array(z.object({ q: text(300), a: text(3000) })).max(30);
const listSchema = z.array(text(300)).max(60);
const idSchema = z.string().min(1).max(64);
const kindSchema = z.enum(["ARTICLE", "GUIDE"]);

const articleSchema = z.object({
  id: idSchema.nullable(),
  kind: kindSchema,
  slug: text(160),
  title: text(200),
  seoTitle: text(200),
  metaDescription: text(400),
  answer: text(3000),
  body: text(200_000),
  faq: faqSchema,
  keywords: listSchema,
  entities: listSchema,
  sources: listSchema,
  heroImageUrl: text(1000),
  heroImageAlt: text(300),
});

const overrideSchema = z.object({
  h1: text(300),
  seoTitle: text(200),
  metaDescription: text(400),
  intro: text(5000),
  body: text(100_000),
  faq: faqSchema,
});

/** What each kind of page lets an editor write — the fields its form shows. */
const OVERRIDE_FIELDS: Partial<Record<SeoTargetType, ReadonlyArray<keyof z.infer<typeof overrideSchema>>>> = {
  CATEGORY: ["h1", "seoTitle", "metaDescription", "intro", "faq"],
  PLATFORM: ["h1", "seoTitle", "metaDescription", "intro", "body", "faq"],
  MODEL: ["h1", "seoTitle", "metaDescription", "intro", "body", "faq"],
  PRODUCT: ["h1", "seoTitle", "metaDescription"],
};

function invalid(error: z.ZodError): { ok: false; error: string } {
  const issue = error.issues[0];
  return { ok: false, error: `Μη έγκυρα στοιχεία${issue?.path.length ? ` (${issue.path.join(".")})` : ""}: ${issue?.message ?? ""}`.trim() };
}

/** The fields that changed, old → new, cut to 200 characters each: the audit's record of an edit. */
function fieldDiff(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  const cut = (v: unknown) => {
    const s = typeof v === "string" ? v : JSON.stringify(v ?? null);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  };
  const diff: Record<string, { from: string; to: string }> = {};
  for (const [key, value] of Object.entries(after)) {
    if (key === "updatedBy") continue;
    const old = before?.[key];
    if (JSON.stringify(old ?? null) !== JSON.stringify(value ?? null)) diff[key] = { from: cut(old), to: cut(value) };
  }
  return diff;
}

// ── Articles and guides ─────────────────────────────────────────────────────

const cleanList = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

/**
 * Save an article or guide. A dealer/representative claim is refused outright;
 * the other checks are warnings the editor sees and may accept.
 */
export async function saveArticleAction(input: ArticleForm): Promise<ActionResult<{ id: string; checks: Check[]; broken: string[] }>> {
  const user = await guard();
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const form = parsed.data;
  const slug = form.slug.trim().toLowerCase();
  if (!KINDS.includes(form.kind)) return { ok: false, error: "Άγνωστο είδος." };
  if (!SLUG.test(slug)) return { ok: false, error: "Το slug θέλει πεζά λατινικά, αριθμούς και παύλες (π.χ. pos-dialego-drapano)." };
  if (!form.title.trim()) return { ok: false, error: "Λείπει ο τίτλος." };
  if (!form.body.trim()) return { ok: false, error: "Λείπει το κείμενο." };
  const hero = form.heroImageUrl.trim();
  // The same rule as the images inside the text: our CDN only.
  if (hero && !allowedImage(hero)) return { ok: false, error: "Η εικόνα πρέπει να είναι στο CDN του καταστήματος (ανεβάστε την από εδώ)." };

  const faq = form.faq.filter((p) => p.q.trim() && p.a.trim()).map((p) => ({ q: p.q.trim(), a: p.a.trim() }));
  const checks = contentChecks({ ...form, faq }, { answerRequired: true });
  const blocking = checks.find((c) => c.level === "error");
  if (blocking) return { ok: false, error: blocking.message };

  const data = {
    kind: form.kind,
    slug,
    title: form.title.trim(),
    seoTitle: form.seoTitle.trim() || null,
    metaDescription: form.metaDescription.trim() || null,
    answer: form.answer.trim() || null,
    body: form.body.trim(),
    faq,
    keywords: cleanList(form.keywords),
    entities: cleanList(form.entities),
    sources: cleanList(form.sources),
    heroImageUrl: hero || null,
    heroImageAlt: form.heroImageAlt.trim() || null,
    updatedBy: (user.email ?? "admin").slice(0, 120),
  };

  const clash = await prisma.contentArticle.findUnique({ where: { slug }, select: { id: true } });
  if (clash && clash.id !== form.id) return { ok: false, error: `Το slug «${slug}» υπάρχει ήδη.` };

  const before = form.id ? await prisma.contentArticle.findUnique({ where: { id: form.id } }) : null;
  if (form.id && !before) return { ok: false, error: "Δεν βρέθηκε." };
  const saved = form.id
    ? await prisma.contentArticle.update({ where: { id: form.id }, data, select: { id: true } })
    : await prisma.contentArticle.create({ data: { ...data, status: "DRAFT" }, select: { id: true } });
  await audit(user, form.id ? "seo.article.update" : "seo.article.create", "ContentArticle", saved.id, {
    slug,
    kind: form.kind,
    changes: fieldDiff(before as Record<string, unknown> | null, data),
  });

  revalidatePath("/admin/seo");
  return { ok: true, id: saved.id, checks, broken: await brokenLinksIn(data.body) };
}

/**
 * Publish or unpublish. Publishing keeps the first publication date; the
 * row's `updatedBy` (who owns the text — the importer or an editor) is left as
 * it is, and who published is in the audit log.
 */
export async function setArticleStatusAction(id: string, publish: boolean): Promise<ActionResult> {
  const user = await guard();
  if (!idSchema.safeParse(id).success || typeof publish !== "boolean") return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const row = await prisma.contentArticle.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Δεν βρέθηκε." };
  if (publish) {
    const blocking = contentChecks({ ...row, faq: [] }).find((c) => c.level === "error");
    if (blocking) return { ok: false, error: blocking.message };
  }
  await prisma.contentArticle.update({
    where: { id },
    data: publish ? { status: "PUBLISHED", publishedAt: row.publishedAt ?? new Date() } : { status: "DRAFT" },
  });
  await audit(user, publish ? "seo.article.publish" : "seo.article.unpublish", "ContentArticle", id, { slug: row.slug });
  revalidatePath("/admin/seo");
  return { ok: true };
}

/** «Δημοσίευση όλων»: every draft (of one kind, or all), except any that claims to be a dealer. */
export async function publishAllAction(kind: ContentKind | null): Promise<ActionResult<{ published: number; refused: string[] }>> {
  const user = await guard();
  if (!kindSchema.nullable().safeParse(kind).success) return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const drafts = await prisma.contentArticle.findMany({
    where: { status: "DRAFT", ...(kind ? { kind } : {}) },
  });
  const refused: string[] = [];
  const now = new Date();
  let published = 0;
  for (const row of drafts) {
    if (contentChecks({ ...row, faq: [] }).some((c) => c.level === "error")) {
      refused.push(row.slug);
      continue;
    }
    await prisma.contentArticle.update({
      where: { id: row.id },
      data: { status: "PUBLISHED", publishedAt: row.publishedAt ?? now },
    });
    published++;
  }
  await audit(user, "seo.article.publishAll", "ContentArticle", kind ?? "ALL", { published, refused });
  revalidatePath("/admin/seo");
  return { ok: true, published, refused };
}

/** The body as the storefront renders it — for the editor's preview. */
export async function previewMarkdownAction(markdown: string): Promise<string> {
  await guard(false);
  const parsed = text(200_000).safeParse(markdown);
  return parsed.success ? renderMarkdown(parsed.data) : "";
}

export async function checkLinksAction(markdown: string): Promise<string[]> {
  await guard(false);
  const parsed = text(200_000).safeParse(markdown);
  return parsed.success ? brokenLinksIn(parsed.data) : [];
}

/** The hero image, to our CDN (resized, WebP) — the same pipeline as the media library. */
export async function uploadHeroAction(form: FormData): Promise<ActionResult<{ url: string; info: string }>> {
  const user = await guard();
  const file = form.get("file");
  const slug = String(form.get("slug") ?? "").trim().toLowerCase().slice(0, 160);
  if (!(file instanceof File)) return { ok: false, error: "Δεν βρέθηκε αρχείο." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Μόνο εικόνες." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: "Το αρχείο ξεπερνά τα 25MB." };
  try {
    // `uploadImage` puts everything under eshop/ already.
    const result = await uploadImage(Buffer.from(await file.arrayBuffer()), {
      folder: `content/${SLUG.test(slug) ? slug : "draft"}`,
      name: `hero-${file.name}`,
    });
    await audit(user, "seo.article.heroUpload", "ContentArticle", slug || "draft", {
      url: result.url,
      file: file.name.slice(0, 120),
      bytes: file.size,
    });
    return { ok: true, url: result.url, info: `${result.width}×${result.height} · ${Math.round(result.bytes / 1024)} KB` };
  } catch (error) {
    console.error("[seo] hero upload failed", error);
    return { ok: false, error: "Η εικόνα δεν ανέβηκε. Δοκιμάστε ξανά ή με μικρότερο αρχείο (JPEG, PNG ή WebP)." };
  }
}

// ── Page SEO overrides ──────────────────────────────────────────────────────

export async function saveOverrideAction(
  targetType: SeoTargetType,
  targetKey: string,
  input: Omit<OverrideForm, "updatedAt" | "updatedBy">,
): Promise<ActionResult<{ result: "saved" | "cleared"; checks: Check[]; broken: string[] }>> {
  const user = await guard();
  const allowed = OVERRIDE_FIELDS[targetType];
  const key = typeof targetKey === "string" ? targetKey.trim() : "";
  if (!allowed || !key || key.length > 200) return { ok: false, error: "Άγνωστη σελίδα." };
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const form = parsed.data;
  const extra = (Object.keys(form) as Array<keyof typeof form>).find(
    (field) => !allowed.includes(field) && (field === "faq" ? form.faq.length > 0 : String(form[field]).trim() !== ""),
  );
  if (extra) return { ok: false, error: `Το πεδίο «${extra}» δεν ισχύει για αυτή τη σελίδα.` };

  const checks = contentChecks({ title: form.h1, seoTitle: form.seoTitle, metaDescription: form.metaDescription, body: `${form.intro}\n${form.body}`, faq: form.faq });
  const blocking = checks.find((c) => c.level === "error");
  if (blocking) return { ok: false, error: blocking.message };
  const result = await saveOverride(targetType, key, form, user.email ?? "admin");
  await audit(user, `seo.override.${result}`, "SeoOverride", `${targetType}:${key}`, {
    fields: allowed.filter((f) => (f === "faq" ? form.faq.length > 0 : String(form[f]).trim() !== "")),
  });
  revalidatePath("/admin/seo");
  return { ok: true, result, checks: checks.filter((c) => c.field !== "title"), broken: await brokenLinksIn(form.body) };
}

// ── Redirects ───────────────────────────────────────────────────────────────

/* The Magento table is 8.000 codes: loaded the first time a test needs it. */
let magento: Promise<ReturnType<typeof createMagentoResolver>> | null = null;
const magentoResolver = () =>
  (magento ??= import("@/config/magento-redirects.json").then((t) => createMagentoResolver(t.default as unknown as MagentoTable)));

/** The shop's host: the configured https origin's, else the final domain (never a dev localhost). */
const canonicalHost = () =>
  siteOriginConfigured() && siteOrigin().startsWith("https://") ? new URL(siteOrigin()).hostname : "milwaukeetoolshdc.gr";

export async function addRedirectAction(fromPath: string, toPath: string): Promise<ActionResult> {
  const user = await guard();
  const input = z.object({ from: text(512), to: text(512) }).safeParse({ from: fromPath, to: toPath });
  if (!input.success) return invalid(input.error);

  const existing = await prisma.redirectRule.findMany({ select: { id: true, fromPath: true, toPath: true } });
  const check = validateRedirect({ from: input.data.from, to: input.data.to, existing, moved: MOVED, canonicalHost: canonicalHost() });
  if (!check.ok) return check;
  const { from, to } = check;
  const broken = await brokenLinks([to]);
  if (broken.length) return { ok: false, error: `Ο προορισμός ${to} δεν υπάρχει.` };

  await prisma.redirectRule.upsert({
    where: { fromPath: from },
    create: { fromPath: from, toPath: to, createdBy: (user.email ?? "admin").slice(0, 120) },
    update: { toPath: to },
  });
  await audit(user, "seo.redirect.add", "RedirectRule", from, { to });
  revalidatePath("/admin/seo");
  return { ok: true };
}

export async function removeRedirectAction(id: string): Promise<ActionResult> {
  const user = await guard();
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const row = await prisma.redirectRule.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Δεν βρέθηκε." };
  await prisma.redirectRule.delete({ where: { id } });
  await audit(user, "seo.redirect.remove", "RedirectRule", row.fromPath, { to: row.toPath });
  revalidatePath("/admin/seo");
  return { ok: true };
}

/** Where an address would go: a manual rule first, then the Magento table (as the proxy does). */
export async function testRedirectAction(path: string): Promise<{ to: string | null; via: "manual" | "magento" | null; status?: number }> {
  await guard(false);
  if (!text(512).safeParse(path).success) return { to: null, via: null };
  const url = (() => {
    try {
      return new URL(path.trim(), "https://x.invalid");
    } catch {
      return null;
    }
  })();
  if (!url) return { to: null, via: null };
  const rules = await prisma.redirectRule.findMany({ select: { id: true, fromPath: true, toPath: true } });
  const manual = createManualResolver(rules)(url.pathname);
  if (manual) return { to: manual.to, via: "manual", status: 301 };
  const hit = (await magentoResolver())(url.pathname, url.search);
  return hit ? { to: hit.to, via: "magento", status: hit.kind === "search" ? 302 : 301 } : { to: null, via: null };
}

// ── AI (GEO) ────────────────────────────────────────────────────────────────

export async function saveLlmsSummaryAction(summary: string): Promise<ActionResult> {
  const user = await guard();
  const parsed = text(1000).safeParse(summary);
  if (!parsed.success) return { ok: false, error: "Η σύνοψη είναι έως 1.000 χαρακτήρες." };
  // Refused here, not silently replaced at render: the editor must see why.
  if (DEALER_WORDING.test(parsed.data)) {
    return { ok: false, error: "Η σύνοψη γράφει «αντιπρόσωπος», «επίσημος διανομέας» ή παρόμοιο: το κατάστημα δεν το δηλώνει." };
  }
  const result = await setSetting("llms.summary.el", parsed.data, user.email ?? "admin");
  if (!result.ok) return { ok: false, error: result.error };
  await audit(user, "seo.llms.summary", "Setting", "llms.summary.el", { length: parsed.data.trim().length });
  revalidatePath("/admin/seo");
  return { ok: true };
}

/**
 * Reads the JSON-LD of a page of this shop, fetched from this server by its
 * own address (src/lib/seo/own-page.ts): no request header decides where the
 * server connects, redirects are reported, and at most 2MB is read.
 */
export async function checkJsonLdAction(
  path: string,
): Promise<ActionResult<{ url: string; status: number; location: string | null; truncated: boolean; blocks: JsonLdBlock[] }>> {
  await guard(false);
  if (typeof path !== "string") return { ok: false, error: "Μη έγκυρα στοιχεία." };
  const page = await fetchOwnPage(path);
  if (!page.ok) return page;
  return {
    ok: true,
    url: page.url,
    status: page.status,
    location: page.location,
    truncated: page.truncated,
    blocks: jsonLdBlocks(page.html),
  };
}

export async function previewLlmsAction(summary: string): Promise<string> {
  await guard(false);
  if (!text(1000).safeParse(summary).success) return "";
  const [{ llmsTxt }, { siteOrigin }, { publishedForLlms }] = await Promise.all([
    import("@/lib/seo/llms"),
    import("@/lib/seo/urls"),
    import("@/lib/blog/articles"),
  ]);
  return llmsTxt(siteOrigin(), { summaryEl: summary, articles: await publishedForLlms() });
}
