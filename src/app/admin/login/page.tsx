import { AuthError } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { HdcAdminMark } from "@/components/admin/HdcAdminMark";
import { upGreek } from "@/lib/greek";

// absolute: το template του root layout θα πρόσθετε δεύτερη φορά το όνομα του καταστήματος.
export const metadata = { title: { absolute: "Διαχείριση · Milwaukee Heavy Duty Centre" } };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string; reset?: string }>;
}) {
  const { redirect: redirectTo, error, reset } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    const target = (formData.get("redirect") as string) || "/admin";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: target,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        // Deliberately generic: never reveal whether the account exists, is
        // inactive, or is locked out — all three look identical to the caller.
        redirect(
          `/admin/login?error=1${
            target ? `&redirect=${encodeURIComponent(target)}` : ""
          }`,
        );
      }
      throw err;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-k-ink-deep px-6">
      <div className="w-full max-w-sm">
        <h1>
          <HdcAdminMark tone="dark" width={200} priority />
        </h1>

        <form action={login} className="mt-8 space-y-4">
          <input type="hidden" name="redirect" value={redirectTo ?? "/admin"} />

          <div>
            <label
              htmlFor="email"
              className="block text-[length:var(--fs-12)] tracking-wider text-k-text-5"
            >
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

          <div>
            <label
              htmlFor="password"
              className="block text-[length:var(--fs-12)] tracking-wider text-k-text-5"
            >
              ΚΩΔΙΚΟΣ
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 w-full border border-white/20 bg-transparent px-3 py-2.5 text-white outline-none focus:border-white"
            />
          </div>

          {reset && !error ? (
            <p role="status" className="text-[length:var(--fs-14)] text-white">
              Ο κωδικός άλλαξε. Συνδεθείτε με τον νέο κωδικό.
            </p>
          ) : null}

          {error === "revoked" ? (
            <p role="alert" className="text-[length:var(--fs-14)] text-k-red">
              Η συνεδρία σας έληξε επειδή άλλαξε ο κωδικός ή η πρόσβαση του
              λογαριασμού. Συνδεθείτε ξανά.
            </p>
          ) : error ? (
            <p role="alert" className="text-[length:var(--fs-14)] text-k-red">
              Λάθος στοιχεία ή ο λογαριασμός δεν είναι ενεργός. Μετά από 5
              αποτυχημένες προσπάθειες η πρόσβαση κλειδώνει για 15 λεπτά.
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full bg-k-red px-4 py-3 text-[length:var(--fs-14)] font-semibold tracking-wider text-white transition-colors hover:bg-k-red-hover"
          >
            {upGreek("Είσοδος")}
          </button>
        </form>

        <Link
          href="/admin/forgot-password"
          className="mt-6 inline-block text-[length:var(--fs-12)] tracking-wider text-k-text-5 underline-offset-4 hover:text-white hover:underline"
        >
          Ξέχασα τον κωδικό
        </Link>
      </div>
    </div>
  );
}
