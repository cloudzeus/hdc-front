"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * EL · EN · IT, as in the announcement bar of the mockups: the current one
 * bold and white, the others grey.
 *
 * Same mechanism as before — next-intl's `Link` with a `locale`, which also
 * writes the locale cookie — but it now stays on the page being read instead
 * of dropping the visitor on the home page. Paths are not localised in this
 * shop, so the locale-less pathname is valid in every language. The query
 * string is not carried: reading it would need `useSearchParams`, which forces
 * a Suspense boundary around the whole header.
 */
export function LocaleSwitch({ className = "" }: { className?: string }) {
  const t = useTranslations("chrome.LocaleSwitch");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("glossa")} className={`hdc-lang ${className}`}>
      {routing.locales.map((code) => (
        <Link
          key={code}
          href={pathname}
          locale={code}
          lang={code}
          hrefLang={code}
          aria-current={code === locale ? "true" : undefined}
          prefetch={false}
        >
          {code.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}
