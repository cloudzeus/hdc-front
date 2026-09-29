import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PRIMARY_PHONE, SHOP } from "@/config/shop";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { hoursMessageArgs } from "@/lib/contact/hours";
import type { Block } from "@/lib/content/hdc-pages";
import { upGreek } from "@/lib/greek";
import { jsonLdHtml } from "@/lib/seo/json-ld";

/**
 * The frame every HDC content page shares: chrome, crumb, the graphite title
 * band, a readable text column and — unless the page is the contact page
 * itself — the "need help?" box, sticky beside the text on desktop and under
 * it on phones.
 */
export async function HdcContentPage({
  locale,
  title,
  lead,
  jsonLd,
  help = true,
  children,
}: {
  locale: Locale;
  title: string;
  lead?: string;
  /** Structured data for the page, printed as JSON-LD. */
  jsonLd?: object;
  help?: boolean;
  children: ReactNode;
}) {
  const [t, menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    getTranslations("content"),
    getMenuTree(locale),
    getTopBrands(locale),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />
      {jsonLd && (
        <script
          type="application/ld+json"
          // JSON.stringify of our own object; `<` escaped so text from HDCtool
          // cannot close the script element.
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
        />
      )}
      <main id="main" className="hdc-cp">
        <nav aria-label="Breadcrumb" className="hdc-wrap hdc-crumb">
          <Link href="/">{t("archiki")}</Link>
          <i aria-hidden>/</i>
          <span>{title}</span>
        </nav>
        <section className="hdc-band hdc-cp-band">
          <div className="hdc-wrap">
            <div>
              <h1 className="hdc-disp">{upGreek(title)}</h1>
              {lead && <p>{lead}</p>}
            </div>
          </div>
        </section>
        <div className={`hdc-wrap hdc-cp-body${help ? "" : " hdc-cp-body--full"}`}>
          <div className="hdc-cp-main">{children}</div>
          {help && (
            <aside className="hdc-cp-help" aria-labelledby="hdc-cp-help-h">
              <h2 id="hdc-cp-help-h" className="hdc-disp">
                {upGreek(t("chreiazeste_voitheia"))}
              </h2>
              <p>{t("voitheia_keimeno")}</p>
              <a href={`tel:${PRIMARY_PHONE.e164}`} className="hdc-cp-help-ph">
                {PRIMARY_PHONE.display}
              </a>
              <a href={`mailto:${SHOP.contact.email}`} className="hdc-cp-help-mail">
                {SHOP.contact.email}
              </a>
              <p className="hdc-cp-help-hours">
                {t("orario_syntomo", hoursMessageArgs(SHOP.contact.hours))}
              </p>
              <Link href="/epikoinonia" className="hdc-btn hdc-btn-red" prefetch={false}>
                {upGreek(t("steilte_minyma"))}
              </Link>
            </aside>
          )}
        </div>
      </main>
      <SiteFooter categories={rootCategories} />
    </>
  );
}

/** Greek-only blocks (shipping, payment, about). */
export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="hdc-prose" lang="el">
      {blocks.map((block, i) =>
        block.type === "h2" ? (
          <h2 key={i}>{upGreek(block.text)}</h2>
        ) : block.type === "ul" ? (
          <ul key={i}>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{block.text}</p>
        ),
      )}
    </div>
  );
}

/**
 * HDCtool rich text. `html` MUST come from `sanitizeHtml` (via `termView` /
 * `faqView`); nothing else is printed raw.
 *
 * `lang` is the language the text is actually in (Greek when an English page
 * fell back to it), so the headings' CSS uppercase drops the accents as Greek
 * capitals do.
 */
export function SanitizedProse({ html, lang }: { html: string; lang?: string }) {
  return <div className="hdc-prose" lang={lang} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** "Available in Greek" and "last updated", above the text. */
export async function ContentMeta({
  locale,
  greekOnly,
  updatedAt,
}: {
  locale: Locale;
  greekOnly: boolean;
  updatedAt?: string | null;
}) {
  const t = await getTranslations("content");
  const updated = updatedAt ? new Date(updatedAt) : null;
  const showLang = greekOnly && locale !== "el";
  if (!showLang && !(updated && !Number.isNaN(updated.getTime()))) return null;
  return (
    <p className="hdc-cp-meta">
      {showLang && (
        <span className="hdc-cp-lang" lang={locale}>
          {t("mono_ellinika")}
        </span>
      )}
      {updated && !Number.isNaN(updated.getTime()) && (
        <span>
          {upGreek(t("teleftaia_enimerosi"))}:{" "}
          {new Intl.DateTimeFormat(locale, {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Europe/Athens",
          }).format(updated)}
        </span>
      )}
    </p>
  );
}

/**
 * What an HDCtool-backed page shows while HDCtool cannot give its text (the
 * endpoint not deployed yet, a refused key, a timeout): a neutral line and
 * the ways to reach the shop — never another shop's policy.
 */
export async function ContentSoon() {
  const t = await getTranslations("content");
  return (
    <div className="hdc-cp-soon" role="status">
      <p>{t("syntoma")}</p>
      <div className="hdc-cp-box">
        <p>
          <b>{t("tilefono")}:</b>{" "}
          <a href={`tel:${PRIMARY_PHONE.e164}`}>{PRIMARY_PHONE.display}</a>
        </p>
        <p>
          <b>Email:</b> <a href={`mailto:${SHOP.contact.email}`}>{SHOP.contact.email}</a>
        </p>
      </div>
      <Link href="/epikoinonia" className="hdc-btn hdc-btn-ink" prefetch={false}>
        {upGreek(t("steilte_minyma"))}
      </Link>
    </div>
  );
}
