import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { assertCan, can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/admin/PageShell";
import { cn } from "@/lib/utils";
import type { ContentKind, ContentStatus } from "@/generated/prisma/enums";
import { getAllModels } from "@/lib/catalog/models";
import { modelPath } from "@/lib/milwaukee/model-slug";
import {
  emptyArticleForm,
  getArticleForm,
  getOverrideForm,
  listArticles,
  magentoCoverage,
  seoAudit,
  type AuditItem,
} from "@/lib/seo/admin-data";
import { HUB_KEYS, HUBS, type HubKey } from "@/lib/seo/hubs";
import { indexingAllowed } from "@/lib/seo/indexing";
import { DEFAULT_SUMMARY_EL } from "@/lib/seo/llms";
import { autoCategorySeo, autoHubSeo, autoModelSeo, autoProductSeo } from "@/lib/seo/page-seo";
import { SITE_ID_ENV, siteId, type SiteIdName } from "@/lib/seo/site-ids";
import { siteOrigin } from "@/lib/seo/urls";
import { getSetting } from "@/lib/settings/settings";
import { autoOverview } from "@/lib/content-auto/admin";
import { AiPanel } from "./_components/AiPanel";
import { AutoPanel } from "./_components/AutoPanel";
import { ArticleEditor } from "./_components/ArticleEditor";
import { ArticlesList } from "./_components/ArticlesList";
import { OverrideEditor } from "./_components/OverrideEditor";
import { RedirectsPanel } from "./_components/RedirectsPanel";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "articles", label: "Άρθρα & οδηγοί" },
  { id: "categories", label: "Κατηγορίες" },
  { id: "hubs", label: "Πλατφόρμες & μοντέλα" },
  { id: "products", label: "Προϊόντα" },
  { id: "redirects", label: "Ανακατευθύνσεις" },
  { id: "audit", label: "Έλεγχος SEO" },
  { id: "ai", label: "AI (GEO)" },
  { id: "auto", label: "Αυτόματα άρθρα" },
  { id: "indexing", label: "Ευρετηρίαση" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * «SEO & Περιεχόμενο»: the articles and guides the blog and /odigoi show, the
 * SEO text of categories, hubs, models and products over their automatic
 * text, the manual 301s, the checks, the llms.txt summary and the indexing
 * state. Greek only — SEO targets the Greek market (owner decision, 30/9/2026).
 * The tab and the item being edited live in the URL.
 */
export default async function SeoPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await auth();
  assertCan(session?.user.role, "seo.view");
  const canEdit = can(session.user.role, "seo.edit");
  const params = await searchParams;
  const tab: TabId = TABS.find((t) => t.id === params.tab)?.id ?? "articles";

  return (
    <PageShell
      title="SEO & Περιεχόμενο"
      description="Άρθρα και οδηγοί, κείμενα SEO των σελίδων, ανακατευθύνσεις και ό,τι διαβάζουν η Google και τα AI. Μόνο ελληνικά."
    >
      <nav aria-label="Καρτέλες SEO" className="mb-4 flex flex-wrap gap-px border border-k-line bg-k-line">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/seo?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 basis-[9rem] items-center justify-center px-3 text-center text-[length:var(--fs-12-5)] font-medium transition-colors",
              t.id === tab ? "bg-k-ink text-white" : "bg-white text-k-text-2 hover:bg-k-surface-3 hover:text-k-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "articles" && <ArticlesTab params={params} canEdit={canEdit} />}
      {tab === "categories" && <CategoriesTab params={params} canEdit={canEdit} />}
      {tab === "hubs" && <HubsTab params={params} canEdit={canEdit} />}
      {tab === "products" && <ProductsTab params={params} canEdit={canEdit} />}
      {tab === "redirects" && <RedirectsTab canEdit={canEdit} />}
      {tab === "audit" && <AuditTab />}
      {tab === "ai" && <AiTab canEdit={canEdit} />}
      {tab === "auto" && <AutoTab canEdit={canEdit} />}
      {tab === "indexing" && <IndexingTab />}
    </PageShell>
  );
}

// ── 1. Articles and guides ──────────────────────────────────────────────────

async function ArticlesTab({ params, canEdit }: { params: Params; canEdit: boolean }) {
  const edit = one(params.edit);
  if (edit) {
    const kind: ContentKind = one(params.kind) === "GUIDE" ? "GUIDE" : "ARTICLE";
    const form = edit === "new" ? emptyArticleForm(kind) : await getArticleForm(edit);
    if (!form) return <p className="text-[length:var(--fs-13)] text-k-text-3">Δεν βρέθηκε.</p>;
    return (
      <div className="grid gap-3">
        <Link href="/admin/seo?tab=articles" className="w-fit text-[length:var(--fs-12)] text-k-red hover:underline">
          ← Όλα τα άρθρα και οι οδηγοί
        </Link>
        <ArticleEditor key={form.id ?? "new"} initial={form} canEdit={canEdit} />
      </div>
    );
  }
  const kind = one(params.kind);
  const status = one(params.status);
  const q = one(params.q);
  const rows = await listArticles({
    kind: kind === "ARTICLE" || kind === "GUIDE" ? (kind as ContentKind) : null,
    status: status === "DRAFT" || status === "PUBLISHED" ? (status as ContentStatus) : null,
    q,
  });
  return <ArticlesList rows={rows} filter={{ kind, status, q }} canEdit={canEdit} />;
}

// ── Pickers: a list on the left, the editor when something is chosen ─────────

function Picker({ items, active, empty }: { items: Array<{ key: string; href: string; label: string; detail?: string; depth?: number }>; active: string; empty: string }) {
  if (items.length === 0) return <p className="p-3 text-[length:var(--fs-12)] text-k-text-3">{empty}</p>;
  return (
    <ul className="max-h-[70vh] overflow-y-auto border border-k-line bg-white">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            aria-current={item.key === active ? "true" : undefined}
            className={cn(
              "flex items-baseline justify-between gap-2 border-b border-k-line px-3 py-2 text-[length:var(--fs-12-5)] hover:bg-k-surface-3",
              item.key === active ? "bg-k-ink text-white hover:bg-k-ink" : "text-k-ink",
            )}
            style={{ paddingLeft: `${0.75 + (item.depth ?? 0) * 0.9}rem` }}
          >
            <span className="min-w-0">{item.label}</span>
            {item.detail && <span className={cn("shrink-0 text-[length:var(--fs-11)]", item.key === active ? "text-white/70" : "text-k-text-4")}>{item.detail}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SearchBox({ tab, q, placeholder }: { tab: string; q: string; placeholder: string }) {
  return (
    <form action="/admin/seo" method="get" className="flex gap-2">
      <input type="hidden" name="tab" value={tab} />
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 min-w-0 flex-1 border border-k-line bg-white px-2 text-[length:var(--fs-13)]"
      />
      <button type="submit" className="h-9 border border-k-line bg-white px-3 text-[length:var(--fs-13)] hover:bg-k-surface-3">
        Αναζήτηση
      </button>
    </form>
  );
}

function TwoPane({ list, editor }: { list: React.ReactNode; editor: React.ReactNode }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="grid content-start gap-2">{list}</div>
      <div className="min-w-0">{editor}</div>
    </div>
  );
}

const Choose = ({ text }: { text: string }) => (
  <p className="border border-dashed border-k-line bg-white p-6 text-[length:var(--fs-13)] text-k-text-3">{text}</p>
);

// ── 2. Categories ───────────────────────────────────────────────────────────

async function CategoriesTab({ params, canEdit }: { params: Params; canEdit: boolean }) {
  const key = one(params.key);
  const q = one(params.q).trim();
  const categories = await prisma.category.findMany({
    where: { productCount: { gt: 0 }, ...(q ? { nameEl: { contains: q, mode: "insensitive" } } : {}) },
    select: { slug: true, nameEl: true, productCount: true, erpType: true, parentId: true, id: true },
    orderBy: [{ productCount: "desc" }],
  });
  /* A tree: each root, then its groups, then their subgroups. */
  const byParent = new Map<string | null, typeof categories>();
  for (const c of categories) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  const ids = new Set(categories.map((c) => c.id));
  const items: Array<{ key: string; href: string; label: string; detail: string; depth: number }> = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of byParent.get(parent) ?? []) {
      items.push({ key: c.slug, href: `/admin/seo?tab=categories&key=${encodeURIComponent(c.slug)}${q ? `&q=${encodeURIComponent(q)}` : ""}`, label: c.nameEl, detail: String(c.productCount), depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  // Search results whose parent was filtered out still show, at the top level.
  for (const c of categories) if (c.parentId && !ids.has(c.parentId) && !items.some((i) => i.key === c.slug)) {
    items.push({ key: c.slug, href: `/admin/seo?tab=categories&key=${encodeURIComponent(c.slug)}&q=${encodeURIComponent(q)}`, label: c.nameEl, detail: String(c.productCount), depth: 0 });
  }

  let editor: React.ReactNode = <Choose text="Διαλέξτε κατηγορία." />;
  if (key) {
    const [auto, initial] = await Promise.all([autoCategorySeo(key), getOverrideForm("CATEGORY", key)]);
    editor = auto ? (
      <OverrideEditor
        key={key}
        targetType="CATEGORY"
        targetKey={key}
        label={auto.name}
        path={`/katalogos/${key}`}
        fields={["h1", "seoTitle", "metaDescription", "intro", "faq"]}
        auto={auto}
        initial={initial}
        canEdit={canEdit}
        origin={siteOrigin()}
      />
    ) : (
      <Choose text="Η κατηγορία δεν βρέθηκε." />
    );
  }
  return <TwoPane list={<><SearchBox tab="categories" q={q} placeholder="Κατηγορία" /><Picker items={items} active={key} empty="Καμία κατηγορία." /></>} editor={editor} />;
}

// ── 3. Platforms and models ─────────────────────────────────────────────────

async function HubsTab({ params, canEdit }: { params: Params; canEdit: boolean }) {
  const key = one(params.key);
  const q = one(params.q).trim().toUpperCase();
  const models = (await getAllModels()).filter((m) => !q || m.root.includes(q)).slice(0, q ? 80 : 40);
  const items = [
    ...HUB_KEYS.map((k) => ({ key: `hub:${k}`, href: `/admin/seo?tab=hubs&key=hub:${k}`, label: HUBS[k].label, detail: HUBS[k].path })),
    ...models.map((m) => ({
      key: `model:${m.root}`,
      href: `/admin/seo?tab=hubs&key=${encodeURIComponent(`model:${m.root}`)}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      label: m.root,
      detail: `${m.versions} εκδ.`,
    })),
  ];

  let editor: React.ReactNode = <Choose text="Διαλέξτε πλατφόρμα ή μοντέλο." />;
  if (key.startsWith("hub:") && (HUB_KEYS as readonly string[]).includes(key.slice(4))) {
    const hub = key.slice(4) as HubKey;
    const [auto, initial] = await Promise.all([autoHubSeo(hub), getOverrideForm("PLATFORM", hub)]);
    editor = (
      <OverrideEditor
        key={key}
        targetType="PLATFORM"
        targetKey={hub}
        label={HUBS[hub].label}
        path={HUBS[hub].path}
        fields={["h1", "seoTitle", "metaDescription", "intro", "body", "faq"]}
        auto={auto}
        initial={initial}
        canEdit={canEdit}
        origin={siteOrigin()}
      />
    );
  } else if (key.startsWith("model:")) {
    const root = key.slice(6);
    const [model, initial] = await Promise.all([autoModelSeo(root), getOverrideForm("MODEL", root)]);
    editor = model ? (
      <OverrideEditor
        key={key}
        targetType="MODEL"
        targetKey={root}
        label={`Milwaukee ${root}`}
        path={modelPath(root)}
        fields={["h1", "seoTitle", "metaDescription", "intro", "body", "faq"]}
        auto={model.auto}
        initial={initial}
        canEdit={canEdit}
        origin={siteOrigin()}
      />
    ) : (
      <Choose text="Το μοντέλο δεν έχει ενεργή έκδοση." />
    );
  }
  return <TwoPane list={<><SearchBox tab="hubs" q={q} placeholder="Μοντέλο, π.χ. M18 FPD3" /><Picker items={items} active={key} empty="Κανένα μοντέλο." /></>} editor={editor} />;
}

// ── 4. Products ─────────────────────────────────────────────────────────────

async function ProductsTab({ params, canEdit }: { params: Params; canEdit: boolean }) {
  const key = one(params.key);
  const q = one(params.q).trim();
  const found = q
    ? await prisma.product.findMany({
        where: {
          isActive: true,
          OR: [{ code2: { contains: q } }, { code1: { contains: q } }, { name: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase() } }],
        },
        select: { slug: true, name: true, code2: true },
        take: 40,
      })
    : [];
  const items = found.map((p) => ({ key: p.slug, href: `/admin/seo?tab=products&q=${encodeURIComponent(q)}&key=${encodeURIComponent(p.slug)}`, label: p.name, detail: p.code2 }));

  let editor: React.ReactNode = <Choose text="Βρείτε ένα προϊόν με κωδικό, EAN ή όνομα." />;
  if (key) {
    const [auto, initial] = await Promise.all([autoProductSeo(key), getOverrideForm("PRODUCT", key)]);
    editor = auto ? (
      <OverrideEditor
        key={key}
        targetType="PRODUCT"
        targetKey={key}
        label={auto.h1}
        path={`/proion/${key}`}
        fields={["h1", "seoTitle", "metaDescription"]}
        auto={auto}
        initial={initial}
        canEdit={canEdit}
        origin={siteOrigin()}
      />
    ) : (
      <Choose text="Το προϊόν δεν βρέθηκε ή δεν είναι ενεργό." />
    );
  }
  return <TwoPane list={<><SearchBox tab="products" q={q} placeholder="Κωδικός, EAN ή όνομα" /><Picker items={items} active={key} empty={q ? "Κανένα προϊόν." : "Γράψτε κάτι για αναζήτηση."} /></>} editor={editor} />;
}

// ── 5. Redirects ────────────────────────────────────────────────────────────

async function RedirectsTab({ canEdit }: { canEdit: boolean }) {
  const rules = await prisma.redirectRule.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <RedirectsPanel
        canEdit={canEdit}
        rows={rules.map((r) => ({
          id: r.id,
          fromPath: r.fromPath,
          toPath: r.toPath,
          hits: r.hits,
          lastHitAt: r.lastHitAt?.toISOString() ?? null,
          createdBy: r.createdBy,
        }))}
      />
      {/* The coverage reads every product: it streams in, the rules do not wait for it. */}
      <Suspense fallback={<section className="border border-k-line bg-white p-4 text-[length:var(--fs-12)] text-k-text-3">Κάλυψη του Magento…</section>}>
        <MagentoCoverage />
      </Suspense>
    </div>
  );
}

async function MagentoCoverage() {
  const coverage = await magentoCoverage();
  const share = coverage.products.total ? Math.round((coverage.products.covered / coverage.products.total) * 1000) / 10 : 0;
  return (
    <section className="grid content-start gap-3 border border-k-line bg-white p-4">
      <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Κάλυψη του Magento</h2>
      <p className="text-[length:var(--fs-12)] leading-[1.5] text-k-text-2">
        Οι παλιές διευθύνσεις προϊόντων του milwaukeetoolshdc.gr τελειώνουν στον κωδικό του προϊόντος και
        ανακατευθύνονται με 301 από τον πίνακα που φτιάχτηκε στις {new Date(coverage.generatedAt).toLocaleDateString("el-GR")}.
      </p>
      <p className="numeral text-[length:var(--fs-21)] font-semibold text-k-ink">
        {share}% <span className="text-[length:var(--fs-12)] font-normal text-k-text-3">({coverage.products.covered} από {coverage.products.total} ενεργά προϊόντα)</span>
      </p>
      {coverage.uncovered.length > 0 && <AuditList title="Χωρίς παλιά διεύθυνση (νεότερα από τον πίνακα)" items={coverage.uncovered} />}
      {coverage.ambiguous.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[length:var(--fs-12)] text-k-text-2">
            {coverage.ambiguous.length} κωδικοί που δείχνουν σε δύο προϊόντα (πηγαίνουν στην αναζήτηση)
          </summary>
          <p className="mt-2 font-mono text-[length:var(--fs-11)] break-all text-k-text-3">{coverage.ambiguous.join(", ")}</p>
        </details>
      )}
      <p className="text-[length:var(--fs-11)] text-k-text-4">Ο πίνακας ξαναφτιάχνεται με το scripts/seo/magento-redirects.ts.</p>
    </section>
  );
}

// ── 6. SEO check ────────────────────────────────────────────────────────────

function AuditList({ title, items }: { title: string; items: AuditItem[] }) {
  return (
    <div>
      <p className="mb-1 text-[length:var(--fs-12)] font-medium text-k-text-2">{title}</p>
      <ul className="grid gap-1">
        {items.map((item, i) => (
          <li key={`${item.href}-${i}`} className="text-[length:var(--fs-12)]">
            <Link href={item.href} className="text-k-ink hover:text-k-red" target={item.href.startsWith("/admin") ? undefined : "_blank"}>
              {item.label}
            </Link>
            {item.detail && <span className="ml-1 font-mono text-k-text-4">{item.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function AuditTab() {
  const groups = await seoAudit();
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {groups.map((g) => (
        <section key={g.id} className="grid content-start gap-2 border border-k-line bg-white p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">{g.title}</h2>
            <span className={cn("numeral text-[length:var(--fs-15)] font-semibold", g.total ? "text-k-red" : "text-[var(--hdc-ok)]")}>{g.total}</span>
          </div>
          <p className="text-[length:var(--fs-11)] text-k-text-3">{g.fix}</p>
          {g.items.length > 0 && <AuditList title={g.total > g.items.length ? `Τα πρώτα ${g.items.length}` : "Όλα"} items={g.items} />}
        </section>
      ))}
    </div>
  );
}

// ── 7. AI (GEO) ─────────────────────────────────────────────────────────────

async function AiTab({ canEdit }: { canEdit: boolean }) {
  const summary = (await getSetting("llms.summary.el")) ?? "";
  return <AiPanel summary={summary} fallback={DEFAULT_SUMMARY_EL} canEdit={canEdit} />;
}

// ── 8. Automatic articles ───────────────────────────────────────────────────

async function AutoTab({ canEdit }: { canEdit: boolean }) {
  return <AutoPanel data={await autoOverview()} canEdit={canEdit} />;
}

// ── 9. Indexing ─────────────────────────────────────────────────────────────

const ID_LABELS: Record<SiteIdName, string> = {
  gscVerification: "Search Console (επαλήθευση)",
  merchantId: "Merchant Center",
  localStoreCode: "Business Profile (κωδικός καταστήματος)",
  gaId: "Google Analytics 4",
  gtmId: "Google Tag Manager",
};

function IndexingTab() {
  const open = indexingAllowed();
  const ids = (Object.keys(ID_LABELS) as SiteIdName[]).map((name) => ({ name, label: ID_LABELS[name], env: SITE_ID_ENV[name], set: !!siteId(name) }));
  const checklist = [
    "Το NEXT_PUBLIC_SITE_URL είναι https://milwaukeetoolshdc.gr",
    "SITE_INDEXING=on στο περιβάλλον του server (Coolify) και επανεκκίνηση",
    "Το /robots.txt επιτρέπει και δείχνει το /sitemap.xml",
    "Search Console: επαλήθευση, υποβολή του /sitemap.xml",
    "Bing Webmaster Tools: εισαγωγή από το Search Console",
    "Merchant Center: το feed /feeds/google-merchant.xml",
    "Business Profile: ίδια ΝΑΠ με το site, σύνδεσμος στο site· NEXT_PUBLIC_GBP_URL για το JSON-LD",
    "Δημοσίευση των άρθρων και οδηγών που είναι έτοιμα",
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="grid content-start gap-3 border border-k-line bg-white p-4">
        <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Κατάσταση</h2>
        <p className={cn("text-[length:var(--fs-21)] font-semibold", open ? "text-[var(--hdc-ok)]" : "text-[var(--hdc-wait)]")}>
          {open ? "Ανοιχτή" : "Κλειστή"}
        </p>
        <p className="text-[length:var(--fs-12)] leading-[1.5] text-k-text-2">
          {open
            ? "Οι μηχανές αναζήτησης και τα AI μπορούν να διαβάσουν το κατάστημα (μόνο τις ελληνικές σελίδες· οι αγγλικές και ιταλικές είναι noindex)."
            : "Το robots.txt κλείνει την πρόσβαση σε όλους και κάθε σελίδα στέλνει noindex. Ανοίγει μόνο με SITE_INDEXING=on στο περιβάλλον του server — όχι από εδώ."}
        </p>
        <h3 className="mt-2 text-[length:var(--fs-12)] font-semibold text-k-ink">Κωδικοί Google</h3>
        <ul className="grid gap-1">
          {ids.map((id) => (
            <li key={id.name} className="flex items-baseline justify-between gap-2 text-[length:var(--fs-12)]">
              <span className="text-k-text-2">
                {id.label} <code className="font-mono text-k-text-4">{id.env}</code>
              </span>
              <span className={id.set ? "text-[var(--hdc-ok)]" : "text-k-text-4"}>{id.set ? "ορίστηκε" : "λείπει"}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid content-start gap-2 border border-k-line bg-white p-4">
        <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Λίστα μετάβασης</h2>
        <ol className="grid list-decimal gap-1.5 pl-5 text-[length:var(--fs-12)] leading-[1.5] text-k-text-2">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
