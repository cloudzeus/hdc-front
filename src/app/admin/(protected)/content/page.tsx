import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listForAdmin } from "@/lib/content/content";
import { listEditableIntlPages } from "@/lib/content/messages";
import { routing, type Locale } from "@/i18n/routing";
import { ContentEditor } from "./ContentEditor";
import { MessagePagesEditor } from "./MessagePagesEditor";
import { PageShell } from "@/components/admin/PageShell";

export const dynamic = "force-dynamic";

/**
 * Admin screen — editable copy.
 *
 * The locale is a query parameter rather than component state so a particular
 * language is a link somebody can send, and so switching does not quietly
 * discard unsaved edits in the previous one — it reloads, which is honest.
 */
export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "content");

  const { locale: requested } = await searchParams;
  const locale = (
    routing.locales.includes(requested as Locale) ? requested : routing.defaultLocale
  ) as Locale;

  const [values, intlPages] = await Promise.all([
    listForAdmin(locale),
    listEditableIntlPages(locale),
  ]);
  const untouched = values.filter((v) => v.isFallback).length;

  return (
    <PageShell
      title="Περιεχόμενο"
      description="Κείμενα και εικόνες του καταστήματος. Ένα άδειο πεδίο επαναφέρει το αρχικό — τίποτα δεν χάνεται."
    >
      {untouched > 0 && (
        <p className="mb-6 text-[12.5px] text-k-text-3">
          {untouched === values.length
            ? "Κανένα κείμενο δεν έχει αλλάξει ακόμη — βλέπετε το αρχικό."
            : `${untouched} από ${values.length} δείχνουν ακόμη το αρχικό κείμενο.`}
        </p>
      )}
      <ContentEditor locale={locale} locales={routing.locales} values={values} />

      <div className="mt-12 border-t border-k-line pt-8">
        <h2 className="text-[17px] font-semibold tracking-tight text-k-ink">Σελίδες ιστότοπου</h2>
        <p className="mt-1 mb-5 max-w-[46rem] text-[12.5px] leading-[1.6] text-k-text-3">
          Τίτλοι, εισαγωγές και κοινά κείμενα των σελίδων. Κάθε σελίδα ανοίγει ξεχωριστά. Οι
          νομικές σελίδες (όροι, απόρρητο, επιστροφές) και οι συχνές ερωτήσεις αντλούν το κυρίως
          κείμενο από το HDCtool.
        </p>
        <MessagePagesEditor locale={locale} pages={intlPages} />
      </div>
    </PageShell>
  );
}
