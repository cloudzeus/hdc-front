import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ContentRunOutcome } from "@/generated/prisma/enums";
import { DeepSeekError, chatJson } from "@/lib/ai/deepseek";
import { brokenLinks } from "@/lib/seo/admin-data";
import { allowedImage } from "@/lib/seo/markdown";
import { faqFromJson, stringsFromJson } from "@/lib/seo/seo-merge";
import { siteOrigin } from "@/lib/seo/urls";
import { getSetting } from "@/lib/settings/settings";
import { contentAdminUrl, sendContentRunEmail } from "@/lib/mail/content-auto-email";
import { athensTime } from "@/lib/content-auto/cadence";
import { STORE_FACTS, loadFactPack, packNumbers, packTerms, promptPack, type FactPack, type PackProduct } from "@/lib/content-auto/fact-pack";
import {
  GATE_LABELS,
  failedGates,
  imageGate,
  linkTargets,
  namesFrom,
  reclassify,
  selfContradicting,
  sanitizeMetadata,
  textGates,
  visibleText,
  type Catalogue,
  type Existing,
  type GateResult,
} from "@/lib/content-auto/gates";
import { insertInlineImages, pickHeroPhoto, uploadHero, type InlineCandidate } from "@/lib/content-auto/images";
import { eligibleTopic, topicOrder, type TopicPayload } from "@/lib/content-auto/planner";
import { articleSlug, modelMentions } from "@/lib/content-auto/text";
import { recheckClaims, reviseArticle, verifyArticle, writeArticle, type Chat, type StyleExample } from "@/lib/content-auto/writer";

/**
 * One run of the automatic writer (spec §2):
 *
 *   topic → fact pack → writer → inline photos → verifier → gates → hero
 *   (only for a unique text, at its final slug) → one transaction: article
 *   (PUBLISHED when every gate passes, the mode allows it, the caps allow it
 *   and — for the cron — the switch is still on; else DRAFT), topic, run →
 *   revalidate → audit → email
 *
 * `startRun` claims the single writer slot and records the run; `executeRun`
 * does the work and never throws — every failure ends in the run record, the
 * audit log and (at most once a day for a passing outage) the email. The
 * admin polls the run row (Cloudflare cuts a request at 100″).
 */

export type RunTrigger = "cron" | "manual-draft" | "manual-publish";

export const AUTO_ACTOR = "auto:content";
/** A run older than this with no end was cut off (restart, deploy). Above the deadline, with room. */
export const STALE_MS = 30 * 60_000;
/** A run that is not done in 20 minutes is abandoned: FAILED, nothing saved or published. */
export const RUN_DEADLINE_MS = 20 * 60_000;
/** Three failed runs on one topic and it is skipped (spec §7). */
export const MAX_ATTEMPTS = 3;
/** Revisions the writer gets in one run when a gate or the verifier fails. */
export const MAX_REVISIONS = 2;
/** Hard caps on automatic publications, whatever started the run (spec §7). */
export const PUBLISH_CAPS = { perDay: 1, perWeek: 3 } as const;
/** Any constant; the writer slot's Postgres advisory lock. */
const LOCK_KEY = 88_120_930;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE = { ARTICLE: "/blog", GUIDE: "/odigoi" } as const;
/** The guides whose voice the writer copies, best first. */
const STYLE_SLUGS = ["pos-dialego-drapano", "drapanokatsavido-mpatarias-pos-dialego", "boulonokleido-pos-dialego"];
const TRANSIENT_PREFIX = "Προσωρινό σφάλμα: ";
const DAY = 86_400_000;

// ── Starting ────────────────────────────────────────────────────────────────

/** Runs that never finished and are too old to be alive: closed as failed. */
async function closeStaleRuns(now = new Date()) {
  await prisma.contentJobRun.updateMany({
    where: { finishedAt: null, startedAt: { lt: new Date(now.getTime() - STALE_MS) } },
    data: { finishedAt: now, outcome: "FAILED", error: "Η εκτέλεση διακόπηκε (επανεκκίνηση του server;)." },
  });
}

/** The next topic: pinned, or scored at the threshold; pinned first, then score, then fewer failures. */
export async function nextTopicId(): Promise<string | null> {
  const topics = await prisma.contentTopic.findMany({
    where: { status: { in: ["PENDING", "FAILED"] } },
    select: { id: true, key: true, pinned: true, attempts: true, score: true },
  });
  return topics.filter(eligibleTopic).sort(topicOrder)[0]?.id ?? null;
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
  if (!topicId) return { ok: false, error: "Δεν υπάρχει θέμα στην ουρά (βαθμολογία ≥ κατώφλι ή «Πρώτο»)." };
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

/**
 * Automatic articles published in the last 7 days and today (Athens), counted
 * on the articles themselves — a withdrawn one still counts: it went out.
 */
export async function publishedCounts(now = new Date()): Promise<{ week: number; today: number; dates: Date[] }> {
  const rows = await prisma.contentArticle.findMany({
    where: { source: "AUTO", publishedAt: { gte: new Date(now.getTime() - 8 * DAY) } },
    select: { publishedAt: true },
  });
  const dates = rows.map((r) => r.publishedAt!).filter(Boolean);
  const today = athensTime(now).date;
  return {
    dates,
    week: dates.filter((d) => now.getTime() - d.getTime() < 7 * DAY).length,
    today: dates.filter((d) => athensTime(d).date === today).length,
  };
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

/**
 * The routes live under /[locale]; they read the database on every request
 * (searchParams, force-dynamic sitemap and llms), so this only clears what a
 * router or data cache may still hold. Outside a request (the cron) Next may
 * refuse, which is harmless.
 */
function revalidateContent(published: boolean) {
  const targets: Array<[string, "page" | "layout" | undefined]> = [["/admin/seo", undefined]];
  if (published) targets.push(["/[locale]/blog", "layout"], ["/[locale]/odigoi", "layout"]);
  for (const [path, type] of targets) {
    try {
      if (type) revalidatePath(path, type);
      else revalidatePath(path);
    } catch {
      /* not in a request scope */
    }
  }
}

/** DeepSeek down, the network, a timeout, a missing key: not the topic's fault. */
export function isTransient(error: unknown): boolean {
  if (error instanceof DeepSeekError) return true;
  const e = error as { name?: string; message?: string; cause?: { code?: string } };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return true;
  const message = String(e?.message ?? "");
  if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(message)) return true;
  if (/DEEPSEEK_API_KEY|DeepSeek \d{3}/.test(message)) return true;
  return typeof e?.cause?.code === "string" && /^E[A-Z]+$/.test(e.cause.code);
}

class DeadlineError extends Error {
  constructor() {
    super(`Η εκτέλεση ξεπέρασε τα ${RUN_DEADLINE_MS / 60_000} λεπτά και εγκαταλείφθηκε· δεν αποθηκεύτηκε τίποτα.`);
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

export type ExecuteOptions = {
  chat?: Chat;
  actorUserId?: string | null;
  /** For the tests; the real runs have 20 minutes. */
  deadlineMs?: number;
};

const deepseek: Chat = (input) => chatJson(input);

type Run = NonNullable<Awaited<ReturnType<typeof loadRun>>>;
type State = { abandoned: boolean; tokens: number; detail: Record<string, unknown>; t0: number };

const loadRun = (id: string) => prisma.contentJobRun.findUnique({ where: { id }, include: { topic: true } });

/** Do the run recorded as `runId`. Never throws; gives up at the deadline. */
export async function executeRun(runId: string, options: ExecuteOptions = {}): Promise<RunSummary> {
  const state: State = { abandoned: false, tokens: 0, detail: {}, t0: Date.now() };
  const run = await loadRun(runId);
  if (!run) return { runId, outcome: "FAILED", topic: null, title: null, slug: null, articleId: null, failedGates: [], tokens: 0, seconds: 0, error: "Η εκτέλεση δεν βρέθηκε." };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"deadline">((resolve) => {
    timer = setTimeout(() => resolve("deadline"), options.deadlineMs ?? RUN_DEADLINE_MS);
  });
  const work = doRun(run, options, state).then(
    (summary) => ({ summary }),
    (error: unknown) => ({ error }),
  );
  const result = await Promise.race([work, deadline]);
  clearTimeout(timer);
  if (result === "deadline") {
    state.abandoned = true;
    return finishFailure(run, new DeadlineError(), state, options);
  }
  if ("error" in result) return finishFailure(run, result.error, state, options);
  return result.summary;
}

async function doRun(run: Run, options: ExecuteOptions, state: State): Promise<RunSummary> {
  const chat = options.chat ?? deepseek;
  const actorUserId = options.actorUserId ?? null;
  const detail = state.detail;
  const check = () => {
    if (state.abandoned) throw new DeadlineError();
  };
  const topic = run.topic;
  if (!topic) throw new Error("Το θέμα δεν υπάρχει πια.");
  const payload = topic.payload as unknown as TopicPayload;
  const allowPublish = run.trigger === "cron" || run.trigger === "manual-publish";
  const notifyTo = await getSetting("content.auto.notifyEmail").catch(() => null);

  // A draft of an earlier run is rewritten only while nobody has touched it.
  const previous = topic.articleId
    ? await prisma.contentArticle.findUnique({
        where: { id: topic.articleId },
        select: { id: true, slug: true, status: true, source: true, updatedBy: true },
      })
    : null;
  if (previous && !(previous.source === "AUTO" && previous.status === "DRAFT" && previous.updatedBy === AUTO_ACTOR)) {
    await prisma.contentTopic.update({ where: { id: topic.id }, data: { status: "DONE", pinned: false } });
    const reason = "Το άρθρο αυτού του θέματος δημοσιεύτηκε ή το επεξεργάστηκε άνθρωπος· δεν ξαναγράφεται.";
    await prisma.contentJobRun.updateMany({
      where: { id: run.id, finishedAt: null },
      data: { finishedAt: new Date(), outcome: "SKIPPED", error: reason, articleId: previous.id },
    });
    return { runId: run.id, outcome: "SKIPPED", topic: topic.title, title: null, slug: previous.slug, articleId: previous.id, failedGates: [], tokens: 0, seconds: (Date.now() - state.t0) / 1000, error: reason };
  }
  const own = previous;

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
  check();

  // 2. The text, and up to MAX_REVISIONS revisions: each attempt is photographed,
  // cleaned of bad metadata, verified and gated in full; a failing attempt goes
  // back to the writer with exactly what failed. The last attempt is what is
  // judged — it fails closed.
  const style = await loadStyleExample();
  const [catalogue, existing] = await Promise.all([loadCatalogue(), loadExisting(own?.id ?? null)]);
  const names = namesFrom([
    ...pack.products.flatMap((p) => [p.name, p.model ?? "", p.code, p.platform ?? ""]),
    ...STORE_FACTS,
    ...catalogue.roots,
    ...catalogue.fullCodes,
  ]);
  const packText = JSON.stringify(promptPack(pack));
  const supported = packNumbers(pack);
  const terms = packTerms(pack);
  const byCode = new Map(pack.products.map((p) => [p.code, p]));
  const tries: Array<Record<string, unknown>> = [];
  detail.attempts = tries;

  let written = await writeArticle(pack, style, chat);
  state.tokens += written.tokens;
  let writerTokens = written.tokens;
  check();

  const evaluate = async (w: typeof written) => {
    // Photos: the writer's choice first, then the representative, then the rest; a packshot on white wins.
    const order = [w.heroProductCode, pack.representative, ...pack.products.map((p) => p.code)];
    const candidates = [...new Set(order.filter((c): c is string => !!c))]
      .map((code) => byCode.get(code))
      .filter((p): p is PackProduct => !!p?.image && allowedImage(p.image))
      .map((p) => ({ code: p.code, url: p.image! }));
    const hero = await pickHeroPhoto(candidates);
    const heroProduct = hero ? byCode.get(hero.code) : undefined;
    const heroAlt = heroProduct
      ? (heroProduct.code === w.heroProductCode && w.heroImageAlt ? w.heroImageAlt : altFor(heroProduct, w.imageAlts))
      : null;
    const inlineOffer = inlineCandidates(pack, heroProduct?.code ?? null, w.imageAlts);
    const inline = insertInlineImages(w.draft.body, inlineOffer);
    const placed = inlineOffer.filter((c) => inline.placed.includes(c.code));
    // Keywords and entities are metadata: the ones that would trip a gate are dropped, not fought over.
    const { draft, dropped } = sanitizeMetadata({ ...w.draft, body: inline.body });
    const alts = [heroAlt, ...placed.map((c) => c.alt)].filter((x): x is string => !!x);
    check();

    // The verifier: everything the article carries, the alts included.
    let unsupported: Awaited<ReturnType<typeof verifyArticle>>["unsupported"] | null = null;
    let verifierTokens = 0;
    let verifierError: string | null = null;
    try {
      const verified = await verifyArticle(pack, draft, chat, alts);
      verifierTokens = verified.tokens;
      unsupported = verified.unsupported;
    } catch (error) {
      verifierTokens = (error as { tokens?: number }).tokens ?? 0;
      if (isTransient(error)) {
        state.tokens += verifierTokens;
        throw error;
      }
      verifierError = error instanceof Error ? error.message : String(error);
    }
    // Findings whose own reason says «supported» are asked once more; dropped only if the re-check agrees.
    let rechecked: string[] = [];
    const doubtful = (unsupported ?? []).filter(selfContradicting).map((u) => u.claim);
    if (unsupported && doubtful.length) {
      const again = await recheckClaims(pack, doubtful, chat);
      verifierTokens += again.tokens;
      rechecked = again.supported;
      unsupported = unsupported.filter((u) => !rechecked.includes(u.claim));
    }
    state.tokens += verifierTokens;
    check();
    // A «fact» with no number, unit, code, feature, kit or store word in it is advice.
    const { items: judged, reclassified } = reclassify(unsupported, terms);
    unsupported = judged;

    const slug = own?.slug ?? articleSlug(draft.title);
    const broken = await brokenLinks(internalPaths(visibleText(draft)));
    const gates = textGates({
      draft,
      alts,
      slug,
      supported,
      catalogue,
      packText,
      links: { allowed: new Set(pack.links.map((l) => l.href)), placedImages: placed.map((c) => c.url), broken },
      names,
      existing,
      unsupported,
    });
    return { hero, heroProduct, heroAlt, placed, draft, dropped, alts, unsupported, reclassified, rechecked, verifierTokens, verifierError, slug, gates };
  };

  let current = await evaluate(written);
  // The attempt that is saved: the first that passes, else the one with the fewest failed gates.
  let best = current;
  let bestAttempt = 0;
  const failedCount = (e: typeof current) => e.gates.filter((g) => !g.ok).length;
  for (let revision = 0; ; revision++) {
    const failing = current.gates.filter((g) => !g.ok);
    if (failing.length < failedCount(best)) {
      best = current;
      bestAttempt = revision;
    }
    tries.push({
      attempt: revision,
      title: current.draft.title,
      writerTokens,
      verifierTokens: current.verifierTokens,
      failedGates: failing.map((g) => g.id),
      problems: failing.map((g) => ({ gate: g.id, problems: g.problems })),
      advice: current.gates.flatMap((g) => g.notes ?? []),
      reclassifiedAsAdvice: current.reclassified,
      droppedAfterRecheck: current.rechecked,
      droppedMetadata: current.dropped,
      verifierError: current.verifierError,
    });
    if (failing.length === 0 || revision >= MAX_REVISIONS) break;
    // Blocking failures first; the verifier's «advice» rides along as «say it more generally».
    const failures = [
      ...failing.flatMap((g) => g.problems.map((p) => `${GATE_LABELS[g.id]}: ${p}`)),
      ...current.gates.flatMap((g) => (g.notes ?? []).map((n) => `${n} — αναδιατύπωσέ το πιο γενικά, χωρίς στοιχείο προϊόντος`)),
    ];
    try {
      const revised = await reviseArticle(pack, style, written, failures, chat);
      state.tokens += revised.tokens;
      writerTokens = revised.tokens;
      written = revised;
    } catch (error) {
      // A revision that does not come back leaves the last judged attempt: it fails closed.
      state.tokens += (error as { tokens?: number }).tokens ?? 0;
      tries.push({ attempt: revision + 1, error: error instanceof Error ? error.message : String(error) });
      break;
    }
    check();
    current = await evaluate(written);
  }
  detail.savedAttempt = bestAttempt;
  current = best;
  const { hero, heroAlt, draft, gates, slug, unsupported } = current;
  detail.writer = { tokens: tries.reduce((sum, a) => sum + Number(a.writerTokens ?? 0), 0), revisions: tries.filter((a) => !a.error).length - 1 };
  detail.images = { hero: current.heroProduct?.code ?? null, inline: current.placed.map((c) => c.code) };
  detail.droppedMetadata = current.dropped;
  const unique = gates.find((g) => g.id === "unique")!.ok;

  // 6. The final slug, THEN the hero at that slug — and only for a unique text,
  // so a colliding title can never overwrite another article's hero.
  const clash = own ? null : await prisma.contentArticle.findUnique({ where: { slug }, select: { id: true } });
  const saveSlug = clash ? `${slug.slice(0, 140)}-auto-${run.id.slice(-6)}` : slug;
  let heroImageUrl: string | null = null;
  let imageProblem: string | null = null;
  if (!hero) imageProblem = "Καμία φωτογραφία προϊόντος (no image)";
  else if (!unique) imageProblem = "Η φωτογραφία δεν ανέβηκε: το κείμενο δεν είναι μοναδικό";
  else if (!SLUG.test(saveSlug)) imageProblem = `Η φωτογραφία δεν ανέβηκε: μη έγκυρο slug «${saveSlug}»`;
  else {
    check();
    try {
      heroImageUrl = await uploadHero(saveSlug, hero.photo);
    } catch (error) {
      imageProblem = `Η φωτογραφία δεν ανέβηκε: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const results: GateResult[] = [...gates, imageGate(heroImageUrl, imageProblem)];
  const failed = failedGates(results);
  detail.gates = results;
  detail.unsupported = unsupported;

  // 7. May it go out? Every gate, the mode, the hard caps, and for the cron the switch — read again now.
  let publish = failed.length === 0 && allowPublish;
  if (publish) {
    const counts = await publishedCounts();
    if (counts.today >= PUBLISH_CAPS.perDay || counts.week >= PUBLISH_CAPS.perWeek) {
      publish = false;
      detail.held = `Όριο δημοσιεύσεων: ${counts.today} σήμερα, ${counts.week} σε 7 ημέρες (έως ${PUBLISH_CAPS.perDay} / ${PUBLISH_CAPS.perWeek}).`;
    }
  }
  if (publish && run.trigger === "cron" && (await getSetting("content.auto.enabled")) !== "on") {
    publish = false;
    detail.held = "Τα αυτόματα άρθρα απενεργοποιήθηκαν κατά την εκτέλεση.";
  }
  check();

  // 8. Article, topic and run in ONE transaction: the run row is claimed only
  // while it is still open, so an abandoned run can never publish.
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
    heroImageAlt: heroImageUrl && heroAlt ? heroAlt.slice(0, 300) : null,
    updatedBy: AUTO_ACTOR,
    source: "AUTO" as const,
    status: publish ? ("PUBLISHED" as const) : ("DRAFT" as const),
    publishedAt: publish ? now : null,
  };
  const done = failed.length === 0;
  const attempts = topic.attempts + (done ? 0 : 1);
  const outcome: ContentRunOutcome = publish ? "PUBLISHED" : "DRAFT";
  const article = await prisma.$transaction(async (tx) => {
    const saved = own
      ? await tx.contentArticle.update({ where: { id: own.id }, data, select: { id: true, slug: true, kind: true } })
      : await tx.contentArticle.create({ data, select: { id: true, slug: true, kind: true } });
    await tx.contentTopic.update({
      where: { id: topic.id },
      // «Πρώτο» means «next»: once tried, the topic takes its place in the queue again.
      data: { articleId: saved.id, status: done ? "DONE" : attempts >= MAX_ATTEMPTS ? "SKIPPED" : "FAILED", attempts, pinned: false },
    });
    const closed = await tx.contentJobRun.updateMany({
      where: { id: run.id, finishedAt: null },
      data: { finishedAt: new Date(), outcome, failedGates: failed, detail: detail as Prisma.InputJsonValue, tokens: state.tokens, articleId: saved.id },
    });
    if (closed.count !== 1 || state.abandoned) throw new DeadlineError();
    return saved;
  });
  const seconds = (Date.now() - state.t0) / 1000;

  // 9. After the commit nothing may fail the run: each step on its own.
  revalidateContent(publish);
  await audit(publish ? "seo.auto.publish" : "seo.auto.draft", "ContentArticle", article.id, actorUserId, {
    slug: article.slug,
    topic: topic.key,
    trigger: run.trigger,
    failedGates: failed,
    held: detail.held ?? null,
    tokens: state.tokens,
  });
  await sendContentRunEmail(notifyTo, {
    outcome,
    topic: topic.title,
    title: draft.title,
    pageUrl: `${siteOrigin()}${BASE[article.kind]}/${article.slug}${publish ? "" : "?preview=1"}`,
    adminUrl: `${siteOrigin()}/admin/seo?tab=articles&edit=${article.id}`,
    problems: [
      ...results.filter((r) => !r.ok).map((r) => ({ title: GATE_LABELS[r.id].toUpperCase(), text: r.problems.slice(0, 4).join(" · ") })),
      ...(detail.held ? [{ title: "ΔΕΝ ΔΗΜΟΣΙΕΥΤΗΚΕ", text: String(detail.held) }] : []),
    ],
    tokens: state.tokens,
    seconds,
    trigger: run.trigger,
  }).catch(() => null);

  return { runId: run.id, outcome, topic: topic.title, title: draft.title, slug: article.slug, articleId: article.id, failedGates: failed, tokens: state.tokens, seconds, error: null };
}

/**
 * The end of a run that did not save: FAILED (the topic's attempt counts), or
 * SKIPPED for an outage — DeepSeek, the network, a missing key — which is not
 * the topic's fault and emails at most once a day. A run the deadline cut is
 * FAILED without costing the topic an attempt.
 */
async function finishFailure(run: Run, error: unknown, state: State, options: ExecuteOptions): Promise<RunSummary> {
  const topic = run.topic;
  const deadline = error instanceof DeadlineError;
  const transient = !deadline && isTransient(error);
  const message = `${transient ? TRANSIENT_PREFIX : ""}${error instanceof Error ? error.message : String(error)}`;
  state.tokens += (error as { tokens?: number }).tokens ?? 0;
  const seconds = (Date.now() - state.t0) / 1000;
  const outcome: ContentRunOutcome = transient ? "SKIPPED" : "FAILED";

  const closed = await prisma.contentJobRun
    .updateMany({
      where: { id: run.id, finishedAt: null },
      data: { finishedAt: new Date(), outcome, error: message.slice(0, 2000), tokens: state.tokens, detail: state.detail as Prisma.InputJsonValue },
    })
    .catch(() => ({ count: 0 }));
  if (closed.count !== 1) {
    // The work committed first (or another closed it): report what the row says.
    const row = await prisma.contentJobRun.findUnique({ where: { id: run.id }, include: { article: { select: { slug: true, title: true } } } }).catch(() => null);
    return {
      runId: run.id,
      outcome: row?.outcome ?? outcome,
      topic: topic?.title ?? null,
      title: row?.article?.title ?? null,
      slug: row?.article?.slug ?? null,
      articleId: row?.articleId ?? null,
      failedGates: Array.isArray(row?.failedGates) ? (row!.failedGates as string[]) : [],
      tokens: row?.tokens ?? state.tokens,
      seconds,
      error: row?.error ?? null,
    };
  }

  if (topic && !transient && !deadline) {
    const attempts = topic.attempts + 1;
    await prisma.contentTopic
      .update({ where: { id: topic.id }, data: { attempts, status: attempts >= MAX_ATTEMPTS ? "SKIPPED" : "FAILED", pinned: false } })
      .catch(() => {});
  }
  await audit(transient ? "seo.auto.skip" : "seo.auto.fail", "ContentTopic", topic?.id ?? run.id, options.actorUserId ?? null, {
    topic: topic?.key ?? null,
    trigger: run.trigger,
    error: message.slice(0, 300),
  });

  const alreadyTold = transient
    ? (await prisma.contentJobRun
        .count({ where: { id: { not: run.id }, outcome: "SKIPPED", error: { startsWith: TRANSIENT_PREFIX }, finishedAt: { gte: new Date(Date.now() - DAY) } } })
        .catch(() => 0)) > 0
    : false;
  if (!alreadyTold) {
    const notifyTo = await getSetting("content.auto.notifyEmail").catch(() => null);
    await sendContentRunEmail(notifyTo, {
      outcome: "FAILED",
      topic: topic?.title ?? "—",
      title: null,
      pageUrl: null,
      adminUrl: contentAdminUrl(),
      problems: [{ title: transient ? "ΠΡΟΣΩΡΙΝΟ ΣΦΑΛΜΑ" : "ΣΦΑΛΜΑ", text: message.slice(0, 500) }],
      tokens: state.tokens,
      seconds,
      trigger: run.trigger,
    }).catch(() => null);
  }
  return { runId: run.id, outcome, topic: topic?.title ?? null, title: null, slug: null, articleId: null, failedGates: [], tokens: state.tokens, seconds, error: message };
}

/** Start and wait: the cron's way. */
export async function runNow(options: StartOptions, execute: ExecuteOptions = {}): Promise<RunSummary | { skipped: string }> {
  const started = await startRun(options);
  if (!started.ok) return { skipped: started.error };
  return executeRun(started.runId, { ...execute, actorUserId: options.actorUserId ?? execute.actorUserId });
}
