import Link from "next/link";
import { redirect } from "next/navigation";
import { upGreek } from "@/lib/greek";
import { requestAdminPasswordReset } from "@/lib/admin/password-reset";

export const metadata = { title: "Ξέχασα τον κωδικό" };

export default async function AdminForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  async function requestReset(formData: FormData) {
    "use server";
    const result = await requestAdminPasswordReset(String(formData.get("email") ?? ""));
    redirect(result.ok ? "/admin/forgot-password?sent=1" : "/admin/forgot-password?error=email");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-k-ink-deep px-6">
      <div className="w-full max-w-sm">
        <p className="text-[length:var(--fs-14)] font-bold tracking-widest text-white">{upGreek("Kolleris")}</p>
        <h1 className="mt-1 text-[length:var(--fs-12)] tracking-widest text-k-text-5">{upGreek("Ξέχασα τον κωδικό")}</h1>

        {sent ? (
          <p role="status" className="mt-8 text-[length:var(--fs-14)] leading-relaxed text-white">
            Αν υπάρχει ενεργός λογαριασμός με αυτό το email, στάλθηκε σύνδεσμος επαναφοράς. Ισχύει 30
            λεπτά.
          </p>
        ) : (
          <form action={requestReset} className="mt-8 space-y-4">
            <p className="text-[length:var(--fs-14)] leading-relaxed text-k-text-5">
              Γράψτε το email του λογαριασμού διαχείρισης. Θα λάβετε σύνδεσμο για να ορίσετε νέο κωδικό.
            </p>
            <div>
              <label htmlFor="email" className="block text-[length:var(--fs-12)] tracking-wider text-k-text-5">
                EMAIL
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                className="mt-1.5 w-full border border-white/20 bg-transparent px-3 py-2.5 text-white outline-none focus:border-white"
              />
            </div>

            {error ? (
              <p role="alert" className="text-[length:var(--fs-14)] text-k-red">
                Συμπληρώστε ένα έγκυρο email.
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full bg-k-red px-4 py-3 text-[length:var(--fs-14)] font-semibold tracking-wider text-white transition-colors hover:bg-k-red-hover"
            >
              {upGreek("Αποστολή συνδέσμου")}
            </button>
          </form>
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
