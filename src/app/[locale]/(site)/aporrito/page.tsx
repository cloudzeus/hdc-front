import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ContentMeta,
  ContentSoon,
  HdcContentPage,
  SanitizedProse,
} from "@/components/content/HdcContentPage";
import type { Locale } from "@/i18n/routing";
import { getEshopContent } from "@/lib/content/eshop-content";
import { findTerm, termView } from "@/lib/content/eshop-content-map";
import { contentMetadata } from "@/lib/content/page-meta";
import { upGreek } from "@/lib/greek";

/**
 * Privacy, with the cookie policy as its own section at `#cookies` (the
 * footer's "Cookies" link lands there). Both texts are HDCtool's:
 * `personal-data-protection-policy` and the `cookie-policy-*` term.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "content" });
  return contentMetadata({
    path: "/aporrito",
    locale,
    title: t("t_aporrito"),
    description: t("lead_aporrito"),
  });
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, content] = await Promise.all([getTranslations("content"), getEshopContent()]);
  const privacy = content ? termView(findTerm(content.terms, "privacy"), locale) : null;
  const cookies = content ? termView(findTerm(content.terms, "cookies"), locale) : null;

  return (
    <HdcContentPage locale={locale} title={t("t_aporrito")} lead={t("lead_aporrito")}>
      {privacy ? (
        <>
          <ContentMeta locale={locale} greekOnly={privacy.fallback} updatedAt={privacy.updatedAt} />
          <SanitizedProse html={privacy.html} lang={privacy.fallback ? "el" : locale} />
        </>
      ) : (
        <ContentSoon />
      )}

      <section id="cookies" className="hdc-cp-section" aria-labelledby="cookies-h">
        <h2 id="cookies-h" className="hdc-disp">
          {upGreek(t("t_cookies"))}
        </h2>
        {cookies ? (
          <>
            <ContentMeta locale={locale} greekOnly={cookies.fallback} updatedAt={cookies.updatedAt} />
            <SanitizedProse html={cookies.html} lang={cookies.fallback ? "el" : locale} />
          </>
        ) : (
          <ContentSoon />
        )}
      </section>
    </HdcContentPage>
  );
}
