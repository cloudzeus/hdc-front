import Link from "next/link";
import { AdminPasswordForm } from "@/components/admin/AdminPasswordForm";
import { HdcAdminMark } from "@/components/admin/HdcAdminMark";
import { adminSsoConfig, ssoReady } from "@/lib/admin/sso/config";

// absolute: το template του root layout θα πρόσθετε δεύτερη φορά το όνομα του καταστήματος.
export const metadata = { title: { absolute: "Διαχείριση · Milwaukee Heavy Duty Centre" } };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string; reset?: string }>;
}) {
  const { redirect: redirectTo, error, reset } = await searchParams;

  // A half-configured environment renders as "off": staff keep the password form.
  const cfg = adminSsoConfig();
  const mode = ssoReady(cfg) ? cfg.mode : "off";
  const showSso = mode !== "off";
  const showPassword = mode !== "only";

  return (
    <div className="flex min-h-screen items-center justify-center bg-k-ink-deep px-6">
      <div className="w-full max-w-sm">
        <h1>
          <HdcAdminMark tone="dark" width={200} priority />
        </h1>

        <div className="mt-8 space-y-6">
          {showSso && (
            <div className="space-y-3">
              <form action="/api/admin/sso/start" method="post">
                <input type="hidden" name="redirect" value={redirectTo ?? "/admin"} />
                <button
                  type="submit"
                  className="w-full bg-k-red px-4 py-3 text-[length:var(--fs-14)] font-semibold tracking-wider text-white transition-colors hover:bg-k-red-hover"
                >
                  Σύνδεση με HDCtool
                </button>
              </form>
              <p className="text-[length:var(--fs-12)] text-k-text-5">
                Αν το HDCtool δεν είναι διαθέσιμο, δοκίμασε σε λίγο
              </p>
              {error === "sso" && (
                <p role="alert" className="text-[length:var(--fs-14)] text-k-red">
                  Η σύνδεση δεν ολοκληρώθηκε, ξαναδοκίμασε
                </p>
              )}
            </div>
          )}

          {showPassword && (
            <AdminPasswordForm failPath="/admin/login" redirectTo={redirectTo} error={error} reset={reset} />
          )}
        </div>

        {/* With ADMIN_SSO=only a password exists only for the emergency list:
            the link lives on the emergency page instead. */}
        {showPassword && (
          <Link
            href="/admin/forgot-password"
            className="mt-6 inline-block text-[length:var(--fs-12)] tracking-wider text-k-text-5 underline-offset-4 hover:text-white hover:underline"
          >
            Ξέχασα τον κωδικό
          </Link>
        )}
      </div>
    </div>
  );
}
