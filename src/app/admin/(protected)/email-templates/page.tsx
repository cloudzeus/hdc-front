import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { assertCan, can } from "@/lib/rbac";
import { routing, type Locale } from "@/i18n/routing";
import { PageShell, Panel } from "@/components/admin/PageShell";
import { SendTestButton } from "@/components/admin/email-templates/SendTestButton";
import { EMAIL_TEMPLATES, previewEmail, templateEntry, type TemplateGroup } from "@/lib/mail/hdc/catalog";
import { requestFingerprint } from "@/lib/mail/request-context";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const GROUPS: TemplateGroup[] = ["Newsletter", "Παραγγελίες", "Λογαριασμός", "Εσωτερικά"];
const LANGUAGE: Record<Locale, string> = { el: "Ελληνικά", en: "English", it: "Italiano" };

type Search = { t?: string; lang?: string; device?: string; variant?: string; order?: string };

/**
 * «Πρότυπα email»: every email the shop sends, previewed with real data (the
 * latest order, real products), per language and on phone or desktop — and
 * sent to yourself before a customer ever sees it.
 *
 * Emails built from an order show a customer's name, address and basket, so
 * those previews also need the «orders» permission.
 */
export default async function EmailTemplatesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await auth();
  assertCan(session?.user.role, "engagement");
  const canOrders = can(session?.user.role, "orders");

  const params = await searchParams;
  const entry = templateEntry(params.t ?? "") ?? EMAIL_TEMPLATES[0];
  const locale: Locale =
    routing.locales.includes(params.lang as Locale) && entry.locales.includes(params.lang as Locale)
      ? (params.lang as Locale)
      : "el";
  const device = params.device === "mobile" ? "mobile" : "desktop";
  const variant = entry.variants?.some((v) => v.id === params.variant) ? params.variant : entry.variants?.[0]?.id;

  const href = (next: Partial<Search>) => {
    const merged: Search = { t: entry.id, lang: locale, device, variant, order: params.order, ...next };
    const query = new URLSearchParams(
      Object.entries(merged).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
    );
    return `/admin/email-templates?${query}`;
  };

  /* Pictures load from the host serving this page, so the preview works in development too. */
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  const blocked = entry.needsOrder && !canOrders;
  const preview = blocked
    ? null
    : await previewEmail(entry.id, {
        locale,
        variant,
        orderNumber: params.order,
        assetOrigin: host ? `${proto}://${host}` : undefined,
        admin: { email: session?.user.email ?? "admin@example.com", name: session?.user.name },
        fingerprint: await requestFingerprint(h),
      });

  return (
    <PageShell
      title="Πρότυπα email"
      description="Όλα τα email του καταστήματος στο design system του HDC. Η προεπισκόπηση χρησιμοποιεί πραγματικά δεδομένα — την τελευταία παραγγελία και προϊόντα του καταλόγου — και το δοκιμαστικό φεύγει μόνο προς εσάς."
    >
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel title="Πρότυπα" description={`${EMAIL_TEMPLATES.length} email`} bodyClassName="py-2">
          <nav aria-label="Πρότυπα email">
            {GROUPS.map((group) => (
              <div key={group} className="py-1.5">
                <p className="px-4 pb-1 text-[length:var(--fs-11)] font-semibold tracking-[0.08em] text-k-text-3 uppercase">
                  {group}
                </p>
                <ul>
                  {EMAIL_TEMPLATES.filter((t) => t.group === group).map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/admin/email-templates?t=${t.id}&device=${device}`}
                        aria-current={t.id === entry.id ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center justify-between gap-2 border-l-2 px-4 py-2 text-[length:var(--fs-13)] lg:min-h-0",
                          t.id === entry.id
                            ? "border-k-ink bg-k-surface-2 font-semibold text-k-ink"
                            : "border-transparent text-k-text-2 hover:bg-k-surface-2",
                        )}
                      >
                        <span className="min-w-0 truncate">{t.name}</span>
                        <span className="shrink-0 text-[length:var(--fs-11)] text-k-text-4">
                          {t.locales.length === 1 ? "EL" : "EL · EN · IT"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </Panel>

        <Panel
          title={entry.name}
          description={entry.trigger}
          actions={
            <SendTestButton
              id={entry.id}
              locale={locale}
              variant={variant}
              order={params.order}
              disabled={!preview?.ok}
            />
          }
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Segmented
              label="Γλώσσα"
              items={routing.locales.map((l) => ({
                key: l,
                label: LANGUAGE[l],
                href: href({ lang: l }),
                active: l === locale,
                disabled: !entry.locales.includes(l),
              }))}
            />
            <Segmented
              label="Συσκευή"
              items={[
                { key: "desktop", label: "Υπολογιστής", href: href({ device: "desktop" }), active: device === "desktop" },
                { key: "mobile", label: "Κινητό", href: href({ device: "mobile" }), active: device === "mobile" },
              ]}
            />
            {entry.variants && (
              <Segmented
                label="Εκδοχή"
                items={entry.variants.map((v) => ({
                  key: v.id,
                  label: v.label,
                  href: href({ variant: v.id }),
                  active: v.id === variant,
                }))}
              />
            )}
          </div>

          {blocked ? (
            <p className="mt-4 border border-l-[3px] border-amber-500 bg-amber-50 px-4 py-3 text-[length:var(--fs-13)] text-k-text-2">
              Αυτό το email δείχνει πραγματική παραγγελία πελάτη (όνομα, διεύθυνση, είδη). Η προεπισκόπηση
              χρειάζεται το δικαίωμα «Παραγγελίες».
            </p>
          ) : !preview?.ok ? (
            <p className="mt-4 border border-l-[3px] border-red-500 bg-red-50 px-4 py-3 text-[length:var(--fs-13)] text-k-text-2">
              {preview?.error ?? "Η προεπισκόπηση απέτυχε."}
            </p>
          ) : (
            <>
              <dl className="mt-4 grid gap-x-4 gap-y-1.5 border-t border-k-line pt-4 text-[length:var(--fs-13)] sm:grid-cols-[8rem_minmax(0,1fr)]">
                <dt className="text-k-text-3">Θέμα</dt>
                <dd className="font-semibold text-k-ink">{preview.email.subject}</dd>
                <dt className="text-k-text-3">Preheader</dt>
                <dd className="text-k-text-2">{preview.email.preheader || "—"}</dd>
                <dt className="text-k-text-3">Δεδομένα</dt>
                <dd className="text-k-text-2">{preview.source}</dd>
              </dl>

              <div className="mt-4 overflow-x-auto border border-k-line bg-k-surface-2 p-3 sm:p-6">
                <iframe
                  title={`Προεπισκόπηση: ${entry.name}`}
                  srcDoc={preview.email.html}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  className="mx-auto block h-[70rem] border-0 bg-white shadow-sm"
                  style={{ width: device === "mobile" ? 375 : "100%", maxWidth: device === "mobile" ? 375 : 680 }}
                />
              </div>

              <details className="mt-4 border border-k-line">
                <summary className="cursor-pointer px-4 py-3 text-[length:var(--fs-13)] font-semibold text-k-ink">
                  Κείμενο χωρίς μορφοποίηση (plain-text μέρος)
                </summary>
                <pre className="max-h-[32rem] overflow-auto border-t border-k-line px-4 py-3 font-mono text-[length:var(--fs-12)] leading-[1.6] whitespace-pre-wrap text-k-text-2">
                  {preview.email.text}
                </pre>
              </details>
            </>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}

function Segmented({
  label,
  items,
}: {
  label: string;
  items: Array<{ key: string; label: string; href: string; active: boolean; disabled?: boolean }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[length:var(--fs-12)] text-k-text-3">{label}</span>
      <div className="flex flex-wrap gap-px bg-k-line">
        {items.map((item) =>
          item.disabled ? (
            <span
              key={item.key}
              aria-disabled="true"
              title="Μόνο στα ελληνικά"
              className="bg-white px-3 py-1.5 text-[length:var(--fs-12)] text-k-text-4"
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center px-3 py-1.5 text-[length:var(--fs-12)] font-medium sm:min-h-0",
                item.active ? "bg-k-ink text-white" : "bg-white text-k-text-2 hover:bg-k-surface-2",
              )}
            >
              {item.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
