/**
 * The /admin gate as a pure decision, so the proxy stays thin and the rules
 * can be tested without a next-auth session.
 */

/** The sign-in page and the hidden emergency (password) page. */
export function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname === "/admin/login/emergency";
}

/** «Ξέχασα τον κωδικό» is for people who cannot sign in, so it is public. */
function isAdminRecoveryPath(pathname: string): boolean {
  return pathname === "/admin/forgot-password" || pathname === "/admin/reset-password";
}

export type AdminGateDecision =
  | { action: "next" }
  | { action: "redirect"; to: string; redirect?: string };

export function adminGate(pathname: string, isAuthed: boolean): AdminGateDecision {
  const isLoginPage = isAdminLoginPath(pathname);
  const isPublic = isLoginPage || isAdminRecoveryPath(pathname);
  if (!isAuthed && !isPublic) return { action: "redirect", to: "/admin/login", redirect: pathname };
  if (isAuthed && isLoginPage) return { action: "redirect", to: "/admin" };
  return { action: "next" };
}
