import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { upGreek } from "@/lib/greek";
import { checkAdminResetToken, completeAdminPasswordReset } from "@/lib/admin/password-reset";
import { PASSWORD_MIN } from "@/lib/admin/users-types";

export const metadata: Metadata = {
  title: "Νέος κωδικός",
  // The token is in this page's URL: never hand it to another site in a Referer.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  short: `Ο κωδικός θέλει τουλάχιστον ${PASSWORD_MIN} χαρακτήρες.`,
  long: "Ο κωδικός είναι πολύ μεγάλος.",
  mismatch: "Οι δύο κωδικοί δεν ταιριάζουν.",
};

const label = "block text-[length:var(--fs-12)] tracking-wider text-k-text-5";
const field =
  "mt-1.5 w-full border border-white/20 bg-transparent px-3 py-2.5 text-white outline-none focus:border-white";

export default async function AdminResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const valid = token ? await checkAdminResetToken(token) : null;

  async function setPassword(formData: FormData) {
    "use server";
    const submitted = String(formData.get("token") ?? "");
    const result = await completeAdminPasswordReset(
      submitted,
      String(formData.get("password") ?? ""),
      String(formData.get("confirm") ?? ""),
    );
    if (result.ok) redirect("/admin/login?reset=1");
    redirect(
      result.error === "invalid"
        ? "/admin/reset-password?error=invalid"
        : `/admin/reset-password?token=${encodeURIComponent(submitted)}&error=${result.error}`,
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-k-ink-deep px-6">
      <div className="w-full max-w-sm">
        <p className="text-[length:var(--fs-14)] font-bold tracking-widest text-white">{upGreek("Kolleris")}</p>
        <h1 className="mt-1 text-[length:var(--fs-12)] tracking-widest text-k-text-5">
          {upGreek("Νέος κωδικός διαχείρισης")}
        </h1>

        {valid ? (
          <form action={setPassword} className="mt-8 space-y-4">
            <input type="hidden" name="token" value={token} />
            {/* Lets a password manager file the new password under the right account. */}
            <input type="hidden" name="username" autoComplete="username" value={valid.email} />
            <p className="text-[length:var(--fs-14)] leading-relaxed text-k-text-5">
              Λογαριασμός <span className="text-white">{valid.email}</span>. Μετά την αλλαγή κλείνουν όλες οι
              ανοιχτές συνεδρίες.
            </p>

            <div>
              <label htmlFor="password" className={label}>
                {upGreek("Νέος κωδικός")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={PASSWORD_MIN}
                maxLength={256}
                autoComplete="new-password"
                className={field}
              />
              <p className="mt-1.5 text-[length:var(--fs-12)] text-k-text-5">
                Τουλάχιστον {PASSWORD_MIN} χαρακτήρες.
              </p>
            </div>

            <div>
              <label htmlFor="confirm" className={label}>
                {upGreek("Επιβεβαίωση κωδικού")}
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={PASSWORD_MIN}
                maxLength={256}
                autoComplete="new-password"
                className={field}
              />
            </div>

            {error && ERRORS[error] ? (
              <p role="alert" className="text-[length:var(--fs-14)] text-k-red">
                {ERRORS[error]}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full bg-k-red px-4 py-3 text-[length:var(--fs-14)] font-semibold tracking-wider text-white transition-colors hover:bg-k-red-hover"
            >
              {upGreek("Αποθήκευση κωδικού")}
            </button>
          </form>
        ) : (
          <div className="mt-8 space-y-4">
            <p role="alert" className="text-[length:var(--fs-14)] leading-relaxed text-white">
              Ο σύνδεσμος έληξε, έχει ήδη χρησιμοποιηθεί ή δεν είναι έγκυρος.
            </p>
            <Link
              href="/admin/forgot-password"
              className="block w-full bg-k-red px-4 py-3 text-center text-[length:var(--fs-14)] font-semibold tracking-wider text-white transition-colors hover:bg-k-red-hover"
            >
              {upGreek("Νέος σύνδεσμος")}
            </Link>
          </div>
        )}

        <Link
          href="/admin/login"
          className="mt-6 inline-block text-[length:var(--fs-12)] tracking-wider text-k-text-5 underline-offset-4 hover:text-white hover:underline"
        >
          ← Επιστροφή στην είσοδο
        </Link>
      </div>
    </div>
  );
}
