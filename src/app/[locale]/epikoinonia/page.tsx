import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HdcContentPage } from "@/components/content/HdcContentPage";
import { ContactForm } from "@/components/contact/ContactForm";
import { SHOP } from "@/config/shop";
import type { Locale } from "@/i18n/routing";
import { openState } from "@/lib/contact/hours";
import { contentMetadata } from "@/lib/content/page-meta";
import { upGreek } from "@/lib/greek";
import { directionsUrl } from "@/lib/hdc-home";
import { infoPageJsonLd } from "@/lib/seo/structured-data";

/**
 * Contact: the four phone lines, the two mailboxes, the address with
 * directions, the hours with a live open/closed line, and the form.
 *
 * Dynamic because the open/closed line reads the clock (Athens time); a cached
 * page would freeze it.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return contentMetadata({
    path: "/epikoinonia",
    locale,
    title: t("t_epikoinonia"),
    description: t("lead_epikoinonia"),
    index: true,
  });
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("content");
  const { contact } = SHOP;

  /* «Ερώτηση για το προϊόν» on a product page lands here with the code in
     `?product=`; it pre-fills the subject. Only a plain code is accepted. */
  const raw = await searchParams;
  const productParam = raw.product;
  const productCode =
    typeof productParam === "string" && /^[A-Za-z0-9 ._-]{1,64}$/.test(productParam)
      ? productParam.trim()
      : null;
  /* «ΣΤΕΙΛΤΕ ΜΑΣ ΜΗΝΥΜΑ» on a search with no results lands here with the query
     in `?q=`; it pre-fills the subject and the message. Plain text only. */
  const searchParam = typeof raw.q === "string" ? raw.q : "";
  const searchedFor =
    searchParam
      .replace(/[\u0000-\u001f\u007f<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64) || null;

  /* The open/closed line: `openState` decides, this phrases it. The weekday
     name comes from Intl, so it is right in every language. */
  const now = openState(new Date());
  const stateLabel =
    now.label.state === "open"
      ? t("anoichta_tora", { time: now.label.until })
      : now.label.at === ""
        ? t("kleista")
        : now.label.when === "today"
          ? t("kleista_anoigei_simera", { time: now.label.at })
          : now.label.when === "tomorrow"
            ? t("kleista_anoigei_ayrio", { time: now.label.at })
            : t("kleista_anoigei_imera", {
                day: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" })
                  // 2024-01-07 was a Sunday, so the index lines up with getDay().
                  .format(Date.UTC(2024, 0, 7 + now.label.day)),
                time: now.label.at,
              });

  const { weekdays, saturday } = contact.hours;

  return (
    <HdcContentPage
      locale={locale}
      title={t("t_epikoinonia")}
      lead={t("lead_epikoinonia")}
      help={false}
      jsonLd={infoPageJsonLd("ContactPage", { name: t("t_epikoinonia"), path: "/epikoinonia" }, locale)}
    >
      <div className="hdc-ct-grid">
        <section className="hdc-ct-card" aria-labelledby="ct-phones">
          <h2 id="ct-phones" className="hdc-semi">
            {upGreek(t("tilefona"))}
          </h2>
          <ul>
            {contact.phones.map((phone) => (
              <li key={phone.e164}>
                <a href={`tel:${phone.e164}`} className="hdc-ct-phone">
                  {phone.display}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="hdc-ct-card" aria-labelledby="ct-email">
          <h2 id="ct-email" className="hdc-semi">
            EMAIL
          </h2>
          <ul>
            <li>
              <span className="hdc-ct-label">{upGreek(t("email_paraggelies"))}</span>
              <a href={`mailto:${contact.ordersEmail}`}>{contact.ordersEmail}</a>
            </li>
            <li>
              <span className="hdc-ct-label">{upGreek(t("email_genika"))}</span>
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
            </li>
          </ul>
        </section>

        <section className="hdc-ct-card" aria-labelledby="ct-address">
          <h2 id="ct-address" className="hdc-semi">
            {upGreek(t("katastima"))}
          </h2>
          <address style={{ fontStyle: "normal" }}>
            {SHOP.name}
            <br />
            {contact.address}
          </address>
          <a
            href={directionsUrl(contact)}
            target="_blank"
            rel="noopener noreferrer"
            className="hdc-btn hdc-btn-ink"
          >
            {upGreek(t("odigies"))}
          </a>
        </section>

        <section className="hdc-ct-card" aria-labelledby="ct-hours">
          <h2 id="ct-hours" className="hdc-semi">
            {upGreek(t("orario"))}
          </h2>
          <ul>
            {weekdays && (
              <li>{t("orario_kathimerines", { open: weekdays.open, close: weekdays.close })}</li>
            )}
            {saturday && (
              <li>{t("orario_savvato", { open: saturday.open, close: saturday.close })}</li>
            )}
            <li>{t("orario_kyriaki")}</li>
          </ul>
          <span className={`hdc-ct-state${now.open ? " is-open" : ""}`}>● {upGreek(stateLabel)}</span>
        </section>
      </div>

      <section aria-labelledby="ct-form">
        <h2 id="ct-form" className="hdc-disp hdc-ct-form-h">
          {upGreek(t("grapste_mas"))}
        </h2>
        <p className="hdc-ct-form-lead">{t("grapste_mas_keimeno")}</p>
        <ContactForm
          locale={locale}
          pagePath="/epikoinonia"
          defaultSubject={
            productCode
              ? t("erotisi_gia_proion", { code: productCode })
              : searchedFor
                ? t("anazitisi_thema", { query: searchedFor })
                : undefined
          }
          defaultMessage={
            !productCode && searchedFor ? t("anazitisi_minyma", { query: searchedFor }) : undefined
          }
        />
      </section>
    </HdcContentPage>
  );
}
