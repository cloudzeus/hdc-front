import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ContentRunOutcome } from "@/generated/prisma/enums";
import { chatJson } from "@/lib/ai/deepseek";
import { brokenLinks } from "@/lib/seo/admin-data";
import { allowedImage } from "@/lib/seo/markdown";
import { faqFromJson, stringsFromJson } from "@/lib/seo/seo-merge";
import { siteOrigin } from "@/lib/seo/urls";
import { getSetting } from "@/lib/settings/settings";
import { contentAdminUrl, sendContentRunEmail } from "@/lib/mail/content-auto-email";
import { loadFactPack, packNumbers, type FactPack, type PackProduct } from "@/lib/content-auto/fact-pack";
import {
  GATE_LABELS,
  failedGates,
  linkTargets,
  runGates,
  visibleText,
  type Catalogue,
  type Existing,
  type GateResult,
} from "@/lib/content-auto/gates";
import { insertInlineImages, uploadHero, type InlineCandidate } from "@/lib/content-auto/images";
import { topicOrder, type TopicPayload } from "@/lib/content-auto/planner";
import { articleSlug, modelMentions } from "@/lib/content-auto/text";
import { verifyArticle, writeArticle, type Chat, type StyleExample } from "@/lib/content-auto/writer";

/**
 * One run of the automatic writer (spec §2):
 *
 *   topic → fact pack → writer → inline photos → verifier → gates → hero →
 *   save (PUBLISHED when every gate passes and the mode allows it, else
 *   DRAFT) → topic state → run record → revalidate → audit → email
 *
 * `startRun` claims the single writer slot and records the run; `executeRun`
 * does the work and never throws — every failure ends in the run record, the
 * audit log and the email. The admin polls the run row (Cloudflare cuts a
 * request at 100″, a run takes longer).
 */

export type RunTrigger = "cron" | "manual-draft" | "manual-publish";

export const AUTO_ACTOR = "auto:content";
/** A run older than this with no end was cut off (restart, deploy). */
export const STALE_MS = 15 * 60_000;
/** Three failed runs on one topic and it is skipped (spec §7). */
export const MAX_ATTEMPTS = 3;
/** Any constant; the writer slot's Postgres advisory lock. */
const LOCK_KEY = 88_120_930;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE = { ARTICLE: "/blog", GUIDE: "/odigoi" } as const;
/** The guides whose voice the writer copies, best first. */
const STYLE_SLUGS = ["pos-dialego-drapano", "drapanokatsavido-mpatarias-pos-dialego", "boulonokleido-pos-dialego"];

// ── Starting ────────────────────────────────────────────────────────────────

/** Runs that never finished and are too old to be alive: closed as failed. */
async function closeStaleRuns(now = new Date()) {
  await prisma.contentJobRun.updateMany({
    where: { finishedAt: null, startedAt: { lt: new Date(now.getTime() - STALE_MS) } },
    data: { finishedAt: now, outcome: "FAILED", error: "Η εκτέλεση διακόπηκε (επανεκκίνηση του server;)." },
  });
}

async function nextTopicId(): Promise<string | null> {
  const topics = await prisma.contentTopic.findMany({
    where: { status: { in: ["PENDING", "FAILED"] } },
    select: { id: true, key: true, pinned: true, attempts: true, score: true },
  });
  return topics.sort(topicOrder)[0]?.id ?? null;
}

export type StartOptions = {
  trigger: RunTrigger;
  /** The admin's email for a manual run. */
  actor?: string | null;
  /** The admin's user id, for the audit log. */
  actorUserId?: string | null;
  topicId?: string | null;
};

export type StartResult = { ok: true; runId: string } | { ok: false; error: string };

/**
 * Claim the writer and record the run. One run at a time across every
 * replica: a transaction-scoped advisory lock around «is one running? no →
 * insert».
 */
export async function startRun(options: StartOptions): Promise<StartResult> {
  await closeStaleRuns();
  const topicId = options.topicId ?? (await nextTopicId());
  if (!topicId) return { ok: false, error: "Δεν υπάρχει θέμα στην ουρά." };
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
    if (!lock?.locked) return { ok: false as const, error: "Τρέχει ήδη μια εκτέλεση." };
    const running = await tx.contentJobRun.findFirst({ where: { finishedAt: null }, select: { id: true } });
    if (running) return { ok: false as const, error: "Τρέχει ήδη μια εκτέλεση· περιμένετε να τελειώσει." };
    const topic = await tx.contentTopic.findUnique({ where: { id: topicId }, select: { id: true, status: true } });
    if (!topic) return { ok: false as const, error: "Το θέμα δεν βρέθηκε." };
    const run = await tx.contentJobRun.create({
      data: { topicId, trigger: options.trigger, actor: options.actor?.slice(0, 120) ?? null },
      select: { id: true },
    });
    return { ok: true as const, runId: run.id };
  });
}

// ── The work ────────────────────────────────────────────────────────────────

async function loadStyleExample(): Promise<StyleExample | null> {
  const rows = await prisma.contentArticle.findMany({
    where: { kind: "GUIDE", status: "PUBLISHED", slug: { in: STYLE_SLUGS } },
    select: { slug: true, title: true, answer: true, body: true, faq: true },
  });
  const row = STYLE_SLUGS.map((s) => rows.find((r) => r.slug === s)).find(Boolean);
  if (!row) return null;
  return { title: row.title, answer: row.answer ?? "", body: row.body, faq: faqFromJson(row.faq) };
}

/** Every code, model root and full model code of the active catalogue (the codes gate). */
async function loadCatalogue(): Promise<Catalogue> {
  const rows = await prisma.product.findMany({ where: { isActive: true }, select: { code1: true, code2: true, name: true, modelRoot: true } });
  const catalogue: Catalogue = { codes: new Set(), roots: new Set(), fullCodes: new Set() };
  for (const r of rows) {
    if (r.code2) catalogue.codes.add(r.code2.trim());
    if (r.code1) catalogue.codes.add(r.code1.trim());
    if (r.modelRoot) catalogue.roots.add(r.modelRoot);
    for (const m of modelMentions(r.name)) {
      catalogue.roots.add(m.root);
      if (m.full) catalogue.fullCodes.add(m.full);
    }
  }
  return catalogue;
}

async function loadExisting(exceptId: string | null): Promise<Existing[]> {
  const rows = await prisma.contentArticle.findMany({ select: { id: true, slug: true, title: true, keywords: true } });
  return rows
    .filter((r) => r.id !== exceptId)
    .map((r) => ({ slug: r.slug, title: r.title, mainKeyword: stringsFromJson(r.keywords)[0] ?? null }));
}

/** «Κρουστικό δραπανοκατσάβιδο Milwaukee M18 FPD3-502X» — the writer's words, else the catalogue's. */
function altFor(p: PackProduct, alts: Record<string, string>): string {
  const alt = alts[p.code]?.trim();
  if (alt) return alt;
  const words = p.name.replace(p.model ?? "", "").replace(/\s+/g, " ").trim().toLowerCase();
  const kind = words ? words[0].toUpperCase() + words.slice(1) : "Εργαλείο";
  return `${kind} Milwaukee ${p.model ?? p.code}`.replace(/\s+/g, " ").trim();
}

function inlineCandidates(pack: FactPack, heroCode: string | null, alts: Record<string, string>): InlineCandidate[] {
  const withPhoto = pack.products.filter((p) => p.image && allowedImage(p.image));
  const others = withPhoto.filter((p) => p.code !== heroCode);
  return (others.length ? others : withPhoto).map((p) => ({
    code: p.code,
    mentions: [p.model, p.code].filter((m): m is string => !!m),
    url: p.image!,
    alt: altFor(p, alts),
  }));
}

function internalPaths(draftText: string): string[] {
  return [
    ...new Set(
      linkTargets(draftText)
        .filter((h) => h.startsWith("/") && !h.startsWith("//"))
        .map((h) => h.split(/[?#]/)[0].replace(/\/+$/, "") || "/"),
    ),
  ];
}

function revalidateContent() {
  // Outside a request (the cron) Next may refuse; the pages read the database on every request anyway.
  for (const path of ["/admin/seo", "/blog", "/odigoi", "/sitemap.xml", "/llms.txt", "/llms-full.txt"]) {
    try {
      revalidatePath(path);
    } catch {
      /* not in a request scope */
    }
  }
}

async function audit(action: string, entity: string, entityId: string, userId: string | null, diff: Record<string, unknown>) {
  await prisma.adminAuditLog
    .create({ data: { userId, action, entity, entityId: entityId.slice(0, 64), diff: diff as Prisma.InputJsonValue } })
    .catch((error) => console.error("[content-auto] audit", error instanceof Error ? error.message : error));
}

export type RunSummary = {
  runId: string;
  outcome: ContentRunOutcome;
  topic: string | null;
  title: string | null;
  slug: string | null;
  articleId: string | null;
  failedGates: string[];
  tokens: number;
  seconds: number;
  error: string | null;
};

export type ExecuteOptions = { chat?: Chat; actorUserId?: string | null };

const deepseek: Chat = (input) => chatJson(input);

/** Do the run recorded as `runId`. Never throws. */
export async function executeRun(runId: string, options: ExecuteOptions = {}): Promise<RunSummary> {
  const t0 = Date.now();
  const chat = options.chat ?? deepseek;
  const actorUserId = options.actorUserId ?? null;
  let tokens = 0;
  const detail: Record<string, unknown> = {};
  const run = await prisma.contentJobRun.findUnique({ where: { id: runId }, include: { topic: true } });
  if (!run) return { runId, outcome: "FAILED", topic: null, title: null, slug: null, articleId: null, failedGates: [], tokens: 0, seconds: 0, error: "Η εκτέλεση δεν βρέθηκε." };
  const topic = run.topic;
  const allowPublish = run.trigger === "cron" || run.trigger === "manual-publish";
  const notifyTo = await getSetting("content.auto.notifyEmail").catch(() => null);

  try {
    if (!topic) throw new Error("Το θέμα δεν υπάρχει πια.");
    const payload = topic.payload as unknown as TopicPayload;

    // 1. The facts.
    const pack = await loadFactPack({ kind: topic.kind, title: topic.title, payload });
    detail.pack = {
      products: pack.products.map((p) => p.code),
      withOfficial: pack.products.filter((p) => p.official.length).map((p) => p.code),
      links: pack.links.length,
      representative: pack.representative,
      notes: pack.notes,
    };
    if (pack.products.length === 0) throw new Error("Κανένα ενεργό προϊόν για το θέμα.");

    // 2. The text.
    const written = await writeArticle(pack, await loadStyleExample(), chat);
    tokens += written.tokens;
    detail.writer = { tokens: written.tokens, attempts: written.attempts };

    // 3. Photos: the hero's source, then the inline ones into the body.
    const byCode = new Map(pack.products.map((p) => [p.code, p]));
    const chosen = written.heroProductCode ? byCode.get(written.heroProductCode) : undefined;
    const heroProduct =
      chosen?.image && allowedImage(chosen.image) ? chosen : pack.representative ? byCode.get(pack.representative) : undefined;
    const heroSource = heroProduct?.image && allowedImage(heroProduct.image) ? heroProduct.image : null;
    const inline = insertInlineImages(written.draft.body, inlineCandidates(pack, heroProduct?.code ?? null, written.imageAlts));
    const draft = { ...written.draft, body: inline.body };
    detail.images = { hero: heroProduct?.code ?? null, inline: inline.placed };

    // 4. The verifier.
    let unsupported: Awaited<ReturnType<typeof verifyArticle>>["unsupported"] | null = null;
    try {
      const verified = await verifyArticle(pack, draft, chat);
      tokens += verified.tokens;
      unsupported = verified.unsupported;
    } catch (error) {
      tokens += (error as { tokens?: number }).tokens ?? 0;
      detail.verifierError = error instanceof Error ? error.message : String(error);
    }

    // 5. The gates.
    const previous = topic.articleId
      ? await prisma.contentArticle.findUnique({ where: { id: topic.articleId }, select: { id: true, slug: true, status: true, source: true } })
      : null;
    const own = previous && previous.source === "AUTO" && previous.status === "DRAFT" ? previous : null;
    const slug = own?.slug ?? articleSlug(draft.title);
    const [catalogue, existing, broken] = await Promise.all([
      loadCatalogue(),
      loadExisting(own?.id ?? null),
      brokenLinks(internalPaths(visibleText(draft))),
    ]);
    const results: GateResult[] = runGates({
      draft,
      slug,
      supported: packNumbers(pack),
      catalogue,
      broken,
      existing,
      unsupported,
      heroSource,
    });

    // 6. The hero, to our CDN — for a draft too, so the editor has it.
    let heroImageUrl: string | null = null;
    if (heroSource && SLUG.test(slug)) {
      try {
        heroImageUrl = await uploadHero(slug, heroSource);
      } catch (error) {
        const image = results.find((r) => r.id === "image")!;
        image.ok = false;
        image.problems.push(`Η φωτογραφία δεν ανέβηκε: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const failed = failedGates(results);
    const publish = failed.length === 0 && allowPublish;
    detail.gates = results;
    detail.unsupported = unsupported;

    // 7. Save. A taken slug (the uniqueness gate failed) gets a suffix: the draft still saves.
    const clash = own ? null : await prisma.contentArticle.findUnique({ where: { slug }, select: { id: true } });
    const saveSlug = clash ? `${slug.slice(0, 140)}-auto-${runId.slice(-6)}` : slug;
    const now = new Date();
    const data = {
      kind: pack.articleKind,
      slug: saveSlug,
      title: draft.title.slice(0, 300),
      seoTitle: draft.seoTitle.slice(0, 200) || null,
      metaDescription: draft.metaDescription.slice(0, 400) || null,
      answer: draft.answer || null,
      body: draft.body,
      faq: draft.faq,
      keywords: draft.keywords,
      entities: draft.entities,
      sources: pack.sources,
      heroImageUrl,
      heroImageAlt: heroImageUrl && heroProduct ? (written.heroImageAlt ?? altFor(heroProduct, written.imageAlts)).slice(0, 300) : null,
      updatedBy: AUTO_ACTOR,
      source: "AUTO" as const,
      status: publish ? ("PUBLISHED" as const) : ("DRAFT" as const),
      publishedAt: publish ? now : null,
    };
    const article = own
      ? await prisma.contentArticle.update({ where: { id: own.id }, data, select: { id: true, slug: true, kind: true } })
      : await prisma.contentArticle.create({ data, select: { id: true, slug: true, kind: true } });

    // 8. The topic: done when published (or a clean draft was asked for); else one more attempt.
    const done = publish || (failed.length === 0 && !allowPublish);
    const attempts = topic.attempts + (done ? 0 : 1);
    await prisma.contentTopic.update({
      where: { id: topic.id },
      data: { articleId: article.id, status: done ? "DONE" : attempts >= MAX_ATTEMPTS ? "SKIPPED" : "FAILED", attempts },
    });

    const outcome: ContentRunOutcome = publish ? "PUBLISHED" : "DRAFT";
    const seconds = (Date.now() - t0) / 1000;
    await prisma.contentJobRun.update({
      where: { id: runId },
      data: { finishedAt: new Date(), outcome, failedGates: failed, detail: detail as Prisma.InputJsonValue, tokens, articleId: article.id },
    });
    if (publish) revalidateContent();
    else {
      try {
        revalidatePath("/admin/seo");
      } catch {
        /* not in a request scope */
      }
    }
    await audit(publish ? "seo.auto.publish" : "seo.auto.draft", "ContentArticle", article.id, actorUserId, {
      slug: article.slug,
      topic: topic.key,
      trigger: run.trigger,
      failedGates: failed,
      tokens,
    });

    const pageUrl = `${siteOrigin()}${BASE[article.kind]}/${article.slug}${publish ? "" : "?preview=1"}`;
    await sendContentRunEmail(notifyTo, {
      outcome,
      topic: topic.title,
      title: draft.title,
      pageUrl,
      adminUrl: `${siteOrigin()}/admin/seo?tab=articles&edit=${article.id}`,
      problems: results
        .filter((r) => !r.ok)
        .map((r) => ({ title: GATE_LABELS[r.id].toUpperCase(), text: r.problems.slice(0, 4).join(" · ") })),
      tokens,
      seconds,
      trigger: run.trigger,
    });

    return { runId, outcome, topic: topic.title, title: draft.title, slug: article.slug, articleId: article.id, failedGates: failed, tokens, seconds, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tokens += (error as { tokens?: number }).tokens ?? 0;
    const seconds = (Date.now() - t0) / 1000;
    if (topic) {
      const attempts = topic.attempts + 1;
      await prisma.contentTopic
        .update({ where: { id: topic.id }, data: { attempts, status: attempts >= MAX_ATTEMPTS ? "SKIPPED" : "FAILED" } })
        .catch(() => {});
    }
    await prisma.contentJobRun
      .update({
        where: { id: runId },
        data: { finishedAt: new Date(), outcome: "FAILED", error: message.slice(0, 2000), tokens, detail: detail as Prisma.InputJsonValue },
      })
      .catch(() => {});
    await audit("seo.auto.fail", "ContentTopic", topic?.id ?? runId, actorUserId, { topic: topic?.key ?? null, trigger: run.trigger, error: message.slice(0, 300) });
    await sendContentRunEmail(notifyTo, {
      outcome: "FAILED",
      topic: topic?.title ?? "—",
      title: null,
      pageUrl: null,
      adminUrl: contentAdminUrl(),
      problems: [{ title: "ΣΦΑΛΜΑ", text: message.slice(0, 500) }],
      tokens,
      seconds,
      trigger: run.trigger,
    });
    return { runId, outcome: "FAILED", topic: topic?.title ?? null, title: null, slug: null, articleId: null, failedGates: [], tokens, seconds, error: message };
  }
}

/** Start and wait: the cron's way. */
export async function runNow(options: StartOptions, execute: ExecuteOptions = {}): Promise<RunSummary | { skipped: string }> {
  const started = await startRun(options);
  if (!started.ok) return { skipped: started.error };
  return executeRun(started.runId, { ...execute, actorUserId: options.actorUserId ?? execute.actorUserId });
}
