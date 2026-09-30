import { NextIntlClientProvider } from "next-intl";
import { NotFoundView } from "@/components/seo/NotFoundView";

/**
 * An address no route matches at all (/a/b/c): the same branded 404, in
 * Greek. The [locale] layout — and with it the messages provider the chrome
 * needs — is not above this file, so it is mounted here.
 */
export default function GlobalNotFound() {
  return (
    <NextIntlClientProvider>
      <div className="page-shell">
        <NotFoundView />
      </div>
    </NextIntlClientProvider>
  );
}
