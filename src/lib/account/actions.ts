"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { accountStore } from "@/lib/account/account-store";
import {
  clearCustomerSession,
  getCustomerToken,
  setCustomerSession,
} from "@/lib/account/session";
import { lookupVat } from "@/lib/account/vat-lookup";
import type { VatLookupResult } from "@/lib/account/vat";

/**
 * Account server actions.
 *
 * The ΑΦΜ lookup is an action rather than a route handler on purpose: it is
 * only ever called from a form, it needs no caching, and keeping the HDCtool
 * bearer behind a server action means there is no public endpoint on this app
 * that will happily enumerate the AADE registry for anyone who finds it.
 */

const afmSchema = z.object({ afm: z.string().min(1).max(32) });

export async function lookupCompanyByVat(input: unknown): Promise<VatLookupResult> {
  const parsed = afmSchema.safeParse(input);
  if (!parsed.success) return { found: false, reason: "invalid" };
  return lookupVat(parsed.data.afm);
}

// ── Sign in / sign up ───────────────────────────────────────────────────────

export type AuthState = { error?: string; fieldErrors?: Record<string, string> };

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(256),
  redirectTo: z.string().max(512).optional(),
});

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: "Λάθος email ή κωδικός.",
  locked_out: "Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε 15 λεπτά.",
  pending_approval:
    "Ο εταιρικός λογαριασμός σας δεν έχει εγκριθεί ακόμη. Ενεργοποιείται σε 2 εργάσιμες.",
  suspended: "Ο λογαριασμός σας έχει ανασταλεί. Καλέστε μας στο 210 411 1355.",
};

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: { email: "Συμπληρώστε email και κωδικό" } };
  }

  let result;
  try {
    result = await accountStore.login({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    });
  } catch (error) {
    return { error: backendMessage(error) };
  }

  if (!result.ok) return { error: LOGIN_ERRORS[result.error] ?? "Η σύνδεση απέτυχε." };

  await setCustomerSession(result.token);
  // Outside the try — `redirect` works by throwing.
  redirect(safeRedirect(parsed.data.redirectTo));
}

/**
 * `redirectTo` comes from the query string, so it is attacker-controlled. Only
 * same-site paths are honoured; anything else lands on the account page.
 */
function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/logariasmos";
  return target;
}

const PASSWORD = z
  .string()
  .min(8, "Τουλάχιστον 8 χαρακτήρες")
  .max(256)
  .refine((v) => /[A-Za-zΑ-Ωα-ω]/.test(v) && /\d/.test(v), "Χρειάζεται γράμματα και αριθμούς");

const baseRegister = {
  email: z.email().max(320),
  password: PASSWORD,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(64),
  terms: z.union([z.literal("on"), z.literal("")]).optional(),
};

/**
 * One kind of account: retail. The company (B2B) application went with the
 * B2B area — an invoice is asked for at checkout instead, where the ΑΦΜ fills
 * in the company. `accountType` is still accepted, and must say "individual".
 */
const registerSchema = z.object({
  accountType: z.literal("individual").optional(),
  ...baseRegister,
});

const REGISTER_ERRORS: Record<string, string> = {
  email_taken: "Υπάρχει ήδη λογαριασμός με αυτό το email.",
  weak_password: "Ο κωδικός είναι πολύ αδύναμος.",
};

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(formData);
  const parsed = registerSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, error: "Ελέγξτε τα σημειωμένα πεδία." };
  }
  if (parsed.data.terms !== "on") {
    return { fieldErrors: { terms: "Πρέπει να αποδεχτείτε τους όρους" } };
  }

  const input = parsed.data;
  const common = {
    email: input.email.toLowerCase(),
    password: input.password,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
  };

  let result;
  try {
    result = await accountStore.register({ accountType: "individual", ...common });
  } catch (error) {
    return { error: backendMessage(error) };
  }

  if (!result.ok) {
    const message = REGISTER_ERRORS[result.error] ?? "Η εγγραφή απέτυχε.";
    const field = result.error === "email_taken" ? "email" : null;
    return field ? { fieldErrors: { [field]: message }, error: message } : { error: message };
  }

  // A retail registration always signs in; without a session, sign in by hand.
  if (result.token) {
    await setCustomerSession(result.token);
    redirect("/logariasmos");
  }
  redirect("/eisodos");
}

export async function signOut() {
  const token = await getCustomerToken();
  if (token) {
    // Best effort: the local cookie must go regardless of what HDCtool says.
    await accountStore.logout(token).catch(() => {});
  }
  await clearCustomerSession();
  redirect("/");
}

// ── Profile ─────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(64),
});

export async function updateProfile(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const token = await getCustomerToken();
  if (!token) return { error: "Η συνεδρία έληξε. Συνδεθείτε ξανά." };

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ελέγξτε τα στοιχεία σας." };

  try {
    await accountStore.updateProfile(token, parsed.data);
  } catch (error) {
    return { error: backendMessage(error) };
  }

  revalidatePath("/logariasmos");
  return { error: undefined };
}

function backendMessage(error: unknown): string {
  // Never surfaced verbatim: the message reaches a login form, and a database
  // error string is an information leak there.
  console.error("[account]", error);
  return "Κάτι πήγε στραβά. Δοκιμάστε ξανά σε λίγο.";
}

// ─── Entry points that start in a mailbox ───────────────────────────────────

/**
 * The three ways somebody gets back into an account they cannot sign into.
 *
 * All four actions below share one shape: they take a form, they return a
 * message, and they never let the answer reveal whether an address is known.
 * That last part is the reason they live here rather than being called from a
 * page — a server action can decide what to say; a client that queried a
 * lookup endpoint could not.
 */

/** «Έχω παραγγείλει και θέλω λογαριασμό» — email plus an order number. */
export async function requestAccountLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState & { sent?: boolean }> {
  const email = String(formData.get("email") ?? "");
  const orderNumber = String(formData.get("orderNumber") ?? "");

  const { requestRegistrationLink } = await import("@/lib/account/registration-invite");
  const result = await requestRegistrationLink({ email, orderNumber });

  if (!result.ok) return { error: result.error };
  /*
   * `sent` is returned whether or not anything matched. The page says "if the
   * details are right, the link is on its way", which is true in both cases
   * and useless to somebody probing for addresses.
   */
  return { sent: true };
}

/** «Ξέχασα τον κωδικό μου». */
export async function requestReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState & { sent?: boolean }> {
  const { requestPasswordReset } = await import("@/lib/account/password-reset");
  const result = await requestPasswordReset(String(formData.get("email") ?? ""));
  if (!result.ok) return { error: result.error };
  return { sent: true };
}

/** Set a new password from a reset link, then send them to sign in. */
export async function submitNewPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState & { done?: boolean }> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) {
    return { fieldErrors: { confirm: "Οι κωδικοί δεν ταιριάζουν." } };
  }

  const { setNewPassword } = await import("@/lib/account/password-reset");
  const result = await setNewPassword(token, password);
  if (!result.ok) return { error: result.error };
  return { done: true };
}

/**
 * Accept a registration invitation: create the account and sign them in.
 *
 * The session is issued here rather than sending them to the login form. They
 * have just proved they hold the mailbox and chosen a password; asking them to
 * type it again immediately is a step that exists only because it was easier
 * to build.
 */
export async function acceptInvitation(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { fieldErrors: { password: "Τουλάχιστον 8 χαρακτήρες." } };
  }
  if (password !== confirm) {
    return { fieldErrors: { confirm: "Οι κωδικοί δεν ταιριάζουν." } };
  }

  const { resolveInvite, completeInvite } = await import("@/lib/account/registration-invite");
  const invite = await resolveInvite(token);
  if (!invite) {
    return { error: "Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί." };
  }

  const result = await accountStore.register({
    email: invite.email,
    password,
    firstName: invite.firstName || "—",
    lastName: invite.lastName || "—",
    phone: invite.phone || "",
    accountType: "individual",
  } as Parameters<typeof accountStore.register>[0]);

  if (!result.ok) {
    return {
      error:
        result.error === "email_taken"
          ? "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδεθείτε."
          : "Η εγγραφή δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
    };
  }

  const adopted = await completeInvite(token, result.user.id, invite.email);
  console.log(`[invite] ${invite.email} registered, adopted ${adopted.adopted} order(s)`);

  /*
   * `register` returns a null token for a company awaiting approval. This path
   * only ever creates `individual` accounts, so a null here would mean the
   * contract changed under us — send them to sign in rather than pretend.
   */
  if (result.token) await setCustomerSession(result.token);
  redirect(result.token ? "/logariasmos" : "/eisodos");
}

/**
 * «Επιβεβαίωση email» from the account pages.
 *
 * Only for the signed-in customer's own address — the action takes no email
 * from the form, so it cannot be pointed at somebody else's mailbox.
 */
export async function requestEmailProofAction(
  _prev: AuthState & { sent?: boolean },
  _formData: FormData,
): Promise<AuthState & { sent?: boolean }> {
  const { getCustomerSession } = await import("@/lib/account/session");
  const session = await getCustomerSession();
  if (session.state !== "signed-in") return { error: "Συνδεθείτε ξανά και δοκιμάστε πάλι." };

  const { requestEmailProof } = await import("@/lib/account/email-proof");
  const result = await requestEmailProof(session.user.id);
  if (!result.ok) return { error: result.error };
  return { sent: true };
}
