import "server-only";
import { renderEmail } from "@/lib/mail/hdc/render";
import { deliver, type DeliverOutcome } from "@/lib/mail/hdc/deliver";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * The note the automatic writer sends after a run (spec §2, §9): the link to
 * a new article, or the draft and the checks it failed, or the error. Greek,
 * internal, the simple layout — to `content.auto.notifyEmail` only.
 */

export type ContentRunMail = {
  outcome: "PUBLISHED" | "DRAFT" | "FAILED";
  topic: string;
  title: string | null;
  /** The public page (published) or the preview (draft). */
  pageUrl: string | null;
  adminUrl: string;
  /** Failed gates, each with its problems; or the error of a failed run. */
  problems: Array<{ title: string; text: string }>;
  tokens: number;
  seconds: number;
  trigger: string;
};

const SUBJECT: Record<ContentRunMail["outcome"], (m: ContentRunMail) => string> = {
  PUBLISHED: (m) => `Νέο αυτόματο άρθρο: ${m.title ?? m.topic}`,
  DRAFT: (m) => `Αυτόματο άρθρο ως πρόχειρο: ${m.title ?? m.topic}`,
  FAILED: (m) => `Αυτόματο άρθρο: αποτυχία (${m.topic})`,
};

const LEAD: Record<ContentRunMail["outcome"], string> = {
  PUBLISHED: "Πέρασε όλους τους ελέγχους και δημοσιεύτηκε. Ελέγξτε το στο κατάστημα· αποσύρεται από το «SEO & Περιεχόμενο».",
  DRAFT: "Γράφτηκε και έμεινε πρόχειρο. Διορθώστε ό,τι χρειάζεται και δημοσιεύστε το από το «SEO & Περιεχόμενο».",
  FAILED: "Η εκτέλεση σταμάτησε πριν αποθηκευτεί κείμενο. Το θέμα θα ξαναδοκιμαστεί (μετά από τρεις αποτυχίες παραλείπεται).",
};

export function buildContentRunEmail(input: ContentRunMail, options: { assetOrigin?: string } = {}) {
  const subject = SUBJECT[input.outcome](input);
  const rows = [
    { label: "Θέμα", value: input.topic, strong: true },
    ...(input.title ? [{ label: "Τίτλος", value: input.title }] : []),
    { label: "Αποτέλεσμα", value: input.outcome === "PUBLISHED" ? "Δημοσιεύτηκε" : input.outcome === "DRAFT" ? "Πρόχειρο" : "Απέτυχε" },
    { label: "Εκτέλεση", value: input.trigger === "cron" ? "Αυτόματη (cron)" : "Χειροκίνητη" },
    { label: "Tokens", value: input.tokens.toLocaleString("el-GR") },
    { label: "Διάρκεια", value: `${Math.round(input.seconds)}″` },
  ];
  const cta =
    input.outcome === "PUBLISHED" && input.pageUrl
      ? { label: "ΑΝΟΙΓΜΑ ΣΤΟ ΚΑΤΑΣΤΗΜΑ", href: input.pageUrl }
      : { label: "ΑΝΟΙΓΜΑ ΣΤΗ ΔΙΑΧΕΙΡΙΣΗ", href: input.adminUrl };
  return renderEmail({
    template: "internal-content",
    locale: "el",
    kind: "internal",
    subject,
    preheader: `${input.topic} · ${rows[input.title ? 2 : 1].value}`,
    topline: { left: "ΑΥΤΟΜΑΤΑ ΑΡΘΡΑ", right: new Date().toLocaleDateString("el-GR") },
    assetOrigin: options.assetOrigin,
    data: {
      content: {
        eyebrow: "ΑΥΤΟΜΑΤΑ ΑΡΘΡΑ",
        title: input.outcome === "PUBLISHED" ? "Νέο άρθρο" : input.outcome === "DRAFT" ? "Πρόχειρο άρθρο" : "Αποτυχία",
        lead: LEAD[input.outcome],
        rows,
        problems: input.problems.slice(0, 12),
        cta_label: cta.label,
        cta_href: cta.href,
      },
    },
  });
}

/** Send it, if an address is set. Never throws. */
export async function sendContentRunEmail(to: string | null, input: ContentRunMail): Promise<DeliverOutcome | null> {
  const address = to?.trim();
  if (!address) return null;
  try {
    return await deliver(buildContentRunEmail(input), { to: address }, `content-auto ${input.outcome}`);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export const contentAdminUrl = () => `${siteOrigin()}/admin/seo?tab=auto`;
