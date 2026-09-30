"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { ContentKind, SeoTargetType } from "@/generated/prisma/client";
import { uploadImage } from "@/lib/media/bunny";
import { renderMarkdown } from "@/lib/seo/markdown";
import { contentChecks, jsonLdBlocks, type Check, type JsonLdBlock } from "@/lib/seo/seo-checks";
import { brokenLinks, brokenLinksIn, saveOverride, type ArticleForm, type OverrideForm } from "@/lib/seo/admin-data";
import { createManualResolver, normalizeRedirectPath } from "@/lib/seo/manual-redirects";
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

// ── Articles and guides ─────────────────────────────────────────────────────

const cleanList = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

/**
 * Save an article or guide. A dealer/representative claim is refused outright;
 * the other checks are warnings the editor sees and may accept.
 */
export async function saveArticleAction(form: ArticleForm): Promise<ActionResult<{ id: string; checks: Check[]; broken: string[] }>> {
  const user = await guard();
  const slug = form.slug.trim().toLowerCase();
  if (!KINDS.includes(form.kind)) return { ok: false, error: "Άγνωστο είδος." };
  if (!SLUG.test(slug)) return { ok: false, error: "Το slug θέλει πεζά λατινικά, αριθμούς και παύλες (π.χ. pos-dialego-drapano)." };
  if (!form.title.trim()) return { ok: false, error: "Λείπει ο τίτλος." };
  if (!form.body.trim()) return { ok: false, error: "Λείπει το κείμενο." };
  const hero = form.heroImageUrl.trim();
  if (hero && !/^https:\/\/\S+$/.test(hero)) return { ok: false, error: "Η εικόνα πρέπει να είναι διεύθυνση https." };

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

  const saved = form.id
    ? await prisma.contentArticle.update({ where: { id: form.id }, data, select: { id: true } })
    : await prisma.contentArticle.create({ data: { ...data, status: "DRAFT" }, select: { id: true } });
  await audit(user, form.id ? "seo.article.update" : "seo.article.create", "ContentArticle", saved.id, { slug, kind: form.kind });

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
  return renderMarkdown(markdown);
}

export async function checkLinksAction(markdown: string): Promise<string[]> {
  await guard(false);
  return brokenLinksIn(markdown);
}

/** The hero image, to our CDN (resized, WebP) — the same pipeline as the media library. */
export async function uploadHeroAction(form: FormData): Promise<ActionResult<{ url: string; info: string }>> {
  await guard();
  const file = form.get("file");
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  if (!(file instanceof File)) return { ok: false, error: "Δεν βρέθηκε αρχείο." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Μόνο εικόνες." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: "Το αρχείο ξεπερνά τα 25MB." };
  try {
    const result = await uploadImage(Buffer.from(await file.arrayBuffer()), {
      folder: `eshop/content/${SLUG.test(slug) ? slug : "draft"}`,
      name: `hero-${file.name}`,
    });
    return { ok: true, url: result.url, info: `${result.width}×${result.height} · ${Math.round(result.bytes / 1024)} KB` };
  } catch (error) {
    console.error("[seo] hero upload failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "Η αποστολή απέτυχε." };
  }
}

// ── Page SEO overrides ──────────────────────────────────────────────────────

const TARGETS: readonly SeoTargetType[] = ["CATEGORY", "PLATFORM", "MODEL", "PRODUCT", "PAGE"];

export async function saveOverrideAction(
  targetType: SeoTargetType,
  targetKey: string,
  form: Omit<OverrideForm, "updatedAt" | "updatedBy">,
): Promise<ActionResult<{ result: "saved" | "cleared"; checks: Check[]; broken: string[] }>> {
  const user = await guard();
  if (!TARGETS.includes(targetType) || !targetKey.trim()) return { ok: false, error: "Άγνωστη σελίδα." };
  const checks = contentChecks({ title: form.h1, seoTitle: form.seoTitle, metaDescription: form.metaDescription, body: `${form.intro}\n${form.body}`, faq: form.faq });
  const blocking = checks.find((c) => c.level === "error");
  if (blocking) return { ok: false, error: blocking.message };
  const result = await saveOverride(targetType, targetKey.trim(), form, user.email ?? "admin");
  await audit(user, `seo.override.${result}`, "SeoOverride", `${targetType}:${targetKey}`, { fields: Object.keys(form).filter((k) => String((form as Record<string, unknown>)[k] ?? "").trim()) });
  revalidatePath("/admin/seo");
  return { ok: true, result, checks: checks.filter((c) => c.field !== "title"), broken: await brokenLinksIn(form.body) };
}

// ── Redirects ───────────────────────────────────────────────────────────────

/* The Magento table is 8.000 codes: loaded the first time a test needs it. */
let magento: Promise<ReturnType<typeof createMagentoResolver>> | null = null;
const magentoResolver = () =>
  (magento ??= import("@/config/magento-redirects.json").then((t) => createMagentoResolver(t.default as unknown as MagentoTable)));

export async function addRedirectAction(fromPath: string, toPath: string): Promise<ActionResult> {
  const user = await guard();
  const from = normalizeRedirectPath(fromPath);
  const to = toPath.trim();
  if (from === "/" || /^\/(admin|api|_next)(\/|$)/.test(from)) return { ok: false, error: "Αυτή η διαδρομή δεν ανακατευθύνεται." };
  if (!/^(\/|https:\/\/)/.test(to)) return { ok: false, error: "Ο προορισμός είναι διαδρομή (/…) ή διεύθυνση https." };
  if (!to.startsWith("https://") && normalizeRedirectPath(to) === from) return { ok: false, error: "Ο προορισμός είναι η ίδια διεύθυνση." };

  const existing = await prisma.redirectRule.findMany({ select: { id: true, fromPath: true, toPath: true } });
  const next = [...existing.filter((r) => normalizeRedirectPath(r.fromPath) !== from), { id: "new", fromPath: from, toPath: to }];
  if (!createManualResolver(next)(from)) return { ok: false, error: "Δημιουργεί βρόχο με άλλη ανακατεύθυνση." };
  if (to.startsWith("/")) {
    const broken = await brokenLinks([normalizeRedirectPath(to)]);
    if (broken.length) return { ok: false, error: `Ο προορισμός ${to} δεν υπάρχει.` };
  }

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

export async function saveLlmsSummaryAction(text: string): Promise<ActionResult> {
  const user = await guard();
  const result = await setSetting("llms.summary.el", text, user.email ?? "admin");
  if (!result.ok) return { ok: false, error: result.error };
  await audit(user, "seo.llms.summary", "Setting", "llms.summary.el", { length: text.trim().length });
  revalidatePath("/admin/seo");
  return { ok: true };
}

/** Fetches a page of this site from this server and reads its JSON-LD. */
export async function checkJsonLdAction(path: string): Promise<ActionResult<{ url: string; status: number; blocks: JsonLdBlock[] }>> {
  await guard(false);
  const clean = path.trim();
  if (!clean.startsWith("/") || clean.startsWith("//")) return { ok: false, error: "Γράψτε μια διαδρομή του καταστήματος, π.χ. /proion/…" };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return { ok: false, error: "Άγνωστο host." };
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}${clean}`;
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const html = await response.text();
    return { ok: true, url, status: response.status, blocks: jsonLdBlocks(html) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Η σελίδα δεν απάντησε." };
  }
}

export async function previewLlmsAction(summary: string): Promise<string> {
  await guard(false);
  const [{ llmsTxt }, { siteOrigin }, { publishedForLlms }] = await Promise.all([
    import("@/lib/seo/llms"),
    import("@/lib/seo/urls"),
    import("@/lib/blog/articles"),
  ]);
  return llmsTxt(siteOrigin(), { summaryEl: summary, articles: await publishedForLlms() });
}
