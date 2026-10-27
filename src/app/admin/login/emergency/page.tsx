import Link from "next/link";
import { AdminPasswordForm } from "@/components/admin/AdminPasswordForm";
import { HdcAdminMark } from "@/components/admin/HdcAdminMark";

export const metadata = {
  title: { absolute: "Διαχείριση (έκτακτη είσοδος) · Milwaukee Heavy Duty Centre" },
  robots: { index: false, follow: false },
};

/**
 * Break-glass password sign-in. Not linked from anywhere; works whatever the
 * SSO mode (the server still decides who may use a password in "only" mode).
 */
export default async function AdminEmergencyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string; reset?: string }>;
}) {
  const { redirect: redirectTo, error, reset } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-k-ink-deep px-6">
      <div className="w-full max-w-sm">
        <h1>
          <HdcAdminMark tone="dark" width={200} priority />
        </h1>
        <div className="mt-8">
          <AdminPasswordForm failPath="/admin/login/emergency" redirectTo={redirectTo} error={error} reset={reset} />
        </div>
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
