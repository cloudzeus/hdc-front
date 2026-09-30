import "server-only";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { siteOrigin } from "@/lib/seo/urls";
import type { RenderedEmail } from "@/lib/mail/hdc/render";
import { stampNow, type RequestFingerprint } from "@/lib/mail/request-context";
import { buildOrderEmail } from "@/lib/mail/order-email";
import { buildInternalOrderEmail, buildInternalStatusEmail } from "@/lib/mail/order-internal-email";
import { buildOrderStatusEmail } from "@/lib/mail/order-status-email";
import { buildShippedEmail } from "@/lib/mail/order-shipped-email";
import { buildDeliveredEmail } from "@/lib/mail/order-delivered-email";
import { buildPaymentFailedEmail } from "@/lib/mail/payment-failed-email";
import { buildPostageCorrectionEmail } from "@/lib/mail/postage-correction-email";
import { buildReviewRequestEmail } from "@/lib/mail/review-request-email";
import {
  buildAdminResetEmail,
  buildNewsletterConfirmEmail,
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
  buildVerifyEmail,
  buildWelcomeEmail,
} from "@/lib/mail/account-emails";
import { renderCampaignEmail, searchCampaignProducts } from "@/lib/newsletter/campaign";
import type { CampaignPayload, PickedProduct } from "@/lib/newsletter/copy";
import { localeUrl } from "@/lib/mail/hdc/render";

/**
 * Every email the shop sends, for the admin page «Πρότυπα email» and the tests.
 *
 * Each entry says who reads it and in which languages, and how to build a
 * preview from REAL data: the latest order, real products. What the preview
 * renders is what the event sends — the same builder, not a copy of it.
 */

export type TemplateGroup = "Newsletter" | "Παραγγελίες" | "Λογαριασμός" | "Εσωτερικά";

export type TemplateEntry = {
  id: string;
  name: string;
  group: TemplateGroup;
  /** Greek only for the shop's own and the admin emails. */
  locales: readonly Locale[];
  /** Needs a real order (and so the «orders» permission to preview). */
  needsOrder: boolean;
  trigger: string;
  variants?: Array<{ id: string; label: string }>;
};

const ALL: readonly Locale[] = ["el", "en", "it"];
const EL: readonly Locale[] = ["el"];

export const EMAIL_TEMPLATES: TemplateEntry[] = [
  { id: "nl-offers", name: "Newsletter · Προσφορές", group: "Newsletter", locales: ALL, needsOrder: false, trigger: "Καμπάνια από τον οδηγό newsletter" },
  { id: "nl-new-products", name: "Newsletter · Νέα προϊόντα", group: "Newsletter", locales: ALL, needsOrder: false, trigger: "Καμπάνια από τον οδηγό newsletter" },
  { id: "nl-news", name: "Newsletter · Νέα", group: "Newsletter", locales: ALL, needsOrder: false, trigger: "Καμπάνια από τον οδηγό newsletter" },
  { id: "newsletter-confirm", name: "Επιβεβαίωση εγγραφής newsletter", group: "Newsletter", locales: ALL, needsOrder: false, trigger: "Εγγραφή στη φόρμα newsletter (double opt-in)" },
  {
    id: "order-confirmation",
    name: "Επιβεβαίωση παραγγελίας",
    group: "Παραγγελίες",
    locales: ALL,
    needsOrder: true,
    trigger: "Πληρωμή με κάρτα (webhook Viva) ή παραγγελία με κατάθεση",
    variants: [
      { id: "default", label: "Όπως η παραγγελία" },
      { id: "supplier", label: "Από προμηθευτή · 3–5 εργάσιμες" },
    ],
  },
  { id: "payment-success", name: "Πληρωμή εγκρίθηκε", group: "Παραγγελίες", locales: ALL, needsOrder: true, trigger: "Πληρωμή παραγγελίας που είχε ήδη επιβεβαιωθεί (κατάθεση, διόρθωση)" },
  { id: "payment-failed", name: "Πληρωμή απέτυχε", group: "Παραγγελίες", locales: ALL, needsOrder: true, trigger: "Απόρριψη κάρτας (webhook Viva)" },
  { id: "order-shipped", name: "Αποστολή", group: "Παραγγελίες", locales: ALL, needsOrder: true, trigger: "Έκδοση voucher ACS" },
  { id: "order-delivered", name: "Παράδοση", group: "Παραγγελίες", locales: ALL, needsOrder: true, trigger: "Σάρωση ACS: παραδόθηκε" },
  { id: "order-status", name: "Αλλαγή κατάστασης", group: "Παραγγελίες", locales: ALL, needsOrder: true, trigger: "Αλλαγή κατάστασης στο SoftOne (HDCtool)" },
  { id: "order-price-correction", name: "Διόρθωση μεταφορικών", group: "Παραγγελίες", locales: ALL, needsOrder: true, trigger: "Διόρθωση μεταφορικών από τη διαχείριση" },
  { id: "review-request", name: "Αίτηση αξιολόγησης", group: "Παραγγελίες", locales: ALL, needsOrder: true, trigger: "7 ημέρες μετά την παράδοση, πελάτες με λογαριασμό" },
  {
    id: "account-verify",
    name: "Επιβεβαίωση email",
    group: "Λογαριασμός",
    locales: ALL,
    needsOrder: false,
    trigger: "Επιβεβαίωση email από τον λογαριασμό, ή εγγραφή πάνω σε παραγγελία",
    variants: [
      { id: "verify", label: "Επιβεβαίωση email" },
      { id: "claim", label: "Εγγραφή από παραγγελία" },
    ],
  },
  { id: "account-password-reset", name: "Επαναφορά κωδικού πελάτη", group: "Λογαριασμός", locales: ALL, needsOrder: false, trigger: "«Ξέχασα τον κωδικό»" },
  { id: "account-password-changed", name: "Ο κωδικός άλλαξε", group: "Λογαριασμός", locales: ALL, needsOrder: false, trigger: "Μετά από αλλαγή ή επαναφορά κωδικού" },
  { id: "account-welcome", name: "Ο λογαριασμός είναι έτοιμος", group: "Λογαριασμός", locales: ALL, needsOrder: false, trigger: "Δημιουργία λογαριασμού" },
  { id: "admin-password-reset", name: "Επαναφορά κωδικού διαχείρισης", group: "Εσωτερικά", locales: EL, needsOrder: false, trigger: "«Ξέχασα τον κωδικό» στη σύνδεση διαχείρισης" },
  { id: "internal-order", name: "Νέα παραγγελία (προς κατάστημα)", group: "Εσωτερικά", locales: EL, needsOrder: true, trigger: "Κάθε νέα παραγγελία · accounts@ και info@" },
  { id: "internal-order-status", name: "Αλλαγή κατάστασης (προς κατάστημα)", group: "Εσωτερικά", locales: EL, needsOrder: true, trigger: "Μαζί με το email αλλαγής κατάστασης του πελάτη · info@" },
];

export function templateEntry(id: string): TemplateEntry | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id);
}

export type PreviewContext = {
  locale: Locale;
  variant?: string;
  assetOrigin?: string;
  /** Which order; the latest one when not given. */
  orderNumber?: string;
  /** The signed-in admin — the sample recipient of account emails. */
  admin: { email: string; name?: string | null };
  fingerprint?: RequestFingerprint;
};

export type PreviewResult =
  | { ok: true; email: RenderedEmail; source: string }
  | { ok: false; error: string };

/** The order a preview is built from: the one asked for, else the latest. */
export async function previewOrderNumber(orderNumber?: string): Promise<string | null> {
  if (orderNumber) {
    const found = await prisma.order.findUnique({ where: { orderNumber }, select: { orderNumber: true } });
    if (found) return found.orderNumber;
  }
  const latest = await prisma.order.findFirst({ orderBy: { createdAt: "desc" }, select: { orderNumber: true } });
  return latest?.orderNumber ?? null;
}

async function sampleProducts(onSale: boolean): Promise<PickedProduct[]> {
  const picked = await searchCampaignProducts(onSale ? { onSaleOnly: true } : {}, 6);
  return picked.length >= 2 || !onSale ? picked : searchCampaignProducts({}, 6);
}

function newsletterPayload(id: string, products: PickedProduct[]): CampaignPayload {
  const origin = siteOrigin();
  if (id === "nl-news") {
    const [first, ...rest] = products;
    return {
      campaign: { eyebrow: "Newsletter", discount: "", title: "", text: "", url: "", valid_until: "" },
      products: [],
      news: {
        issue: {
          label: "Newsletter",
          number: "",
          title: "Νέα από το κατάστημα του Πειραιά",
          intro: "Τι έφτασε, τι αλλάζει και ποιο εργαλείο ταιριάζει σε ποια δουλειά.",
        },
        hero: {
          eyebrow: "Νέο στο κατάστημα",
          title_before: first ? first.name : "Milwaukee M18 FUEL",
          title_accent: "",
          title_after: "",
          text: "Δείτε το από κοντά στο κατάστημα του Πειραιά ή παραγγείλτε το online.",
          image: first?.image ?? "",
          image_alt: first?.name ?? "",
          cta: "Δείτε το",
          url: first ? `${origin}/proion/${first.slug}` : `${origin}/nees-afixeis`,
        },
        articles: rest.slice(0, 3).map((p, i) => ({
          id: `a${i}`,
          title: p.name,
          excerpt: `Κωδικός ${p.code2 || p.code}. ${p.price} με ΦΠΑ.`,
          tag: p.tag ?? "MILWAUKEE",
          image: p.image,
          url: `${origin}/proion/${p.slug}`,
          cta: "",
        })),
      },
    };
  }
  const offers = id === "nl-offers";
  return {
    campaign: {
      eyebrow: offers ? "Προσφορές του μήνα" : "Νέα προϊόντα",
      discount: offers ? "−15%" : "",
      title: offers ? "Σε M18 FUEL, M12 FUEL και PACKOUT" : "Μόλις έφτασαν στο κατάστημα",
      text: offers
        ? "Εργαλεία, μπαταρίες και αποθήκευση σε τιμές προσφοράς. Οι τιμές είναι τελικές, με ΦΠΑ."
        : "Τα νεότερα εργαλεία Milwaukee, διαθέσιμα στο κατάστημα του Πειραιά και online.",
      url: "",
      valid_until: offers ? "31.10.2026" : "",
      image: products[0]?.image ?? "",
    },
    products,
  };
}

/** Build the preview of one template in one language, from real data. */
export async function previewEmail(id: string, ctx: PreviewContext): Promise<PreviewResult> {
  const entry = templateEntry(id);
  if (!entry) return { ok: false, error: "Άγνωστο πρότυπο." };
  const locale = entry.locales.includes(ctx.locale) ? ctx.locale : "el";
  const opts = { locale, assetOrigin: ctx.assetOrigin };
  const fingerprint: RequestFingerprint = ctx.fingerprint ?? {
    device: "Chrome σε Windows",
    location: "Άγνωστη τοποθεσία",
    ip: "203.0.113.10",
  };
  const to = { firstName: ctx.admin.name ?? "", email: ctx.admin.email };
  const sampleLink = (path: string) => localeUrl(locale, `${path}/PREVIEW-${Date.now().toString(36)}`);

  if (entry.group === "Newsletter" && id !== "newsletter-confirm") {
    const products = id === "nl-news" ? await sampleProducts(false) : await sampleProducts(id === "nl-offers");
    const email = renderCampaignEmail(id, newsletterPayload(id, products), {
      ...opts,
      subject: templateEntry(id)?.name,
      preheader: "",
    });
    return { ok: true, email, source: `${products.length} πραγματικά προϊόντα από τον κατάλογο · κείμενα καμπάνιας δείγμα` };
  }

  if (!entry.needsOrder) {
    let email: RenderedEmail;
    switch (id) {
      case "newsletter-confirm":
        email = await buildNewsletterConfirmEmail({ to: ctx.admin.email, url: sampleLink("/newsletter/epibebaiosi"), hours: 48 }, opts);
        break;
      case "account-verify":
        email = await buildVerifyEmail(
          ctx.variant === "claim"
            ? { to, url: sampleLink("/eggrafi"), hours: 72, mode: "claim", orderNumber: (await previewOrderNumber()) ?? "HDC-20260930-0001" }
            : { to, url: sampleLink("/logariasmos/epivevaiosi-email"), hours: 24, mode: "verify" },
          opts,
        );
        break;
      case "account-password-reset":
        email = await buildPasswordResetEmail(
          { to, url: sampleLink("/eisodos/neos-kodikos"), hours: 2, requestedAt: stampNow(), fingerprint },
          opts,
        );
        break;
      case "account-password-changed":
        email = await buildPasswordChangedEmail(to, fingerprint, opts);
        break;
      case "account-welcome":
        email = await buildWelcomeEmail(to, opts);
        break;
      case "admin-password-reset":
        email = buildAdminResetEmail(
          {
            to: ctx.admin.email,
            url: `${siteOrigin()}/admin/reset-password?token=PREVIEW`,
            minutes: 30,
            requestedAt: stampNow(),
            fingerprint,
          },
          { assetOrigin: ctx.assetOrigin },
        );
        break;
      default:
        return { ok: false, error: "Άγνωστο πρότυπο." };
    }
    return { ok: true, email, source: `Σύνδεσμοι δείγματος · παραλήπτης ${ctx.admin.email}` };
  }

  const orderNumber = await previewOrderNumber(ctx.orderNumber);
  if (!orderNumber) return { ok: false, error: "Δεν υπάρχει ακόμη καμία παραγγελία για προεπισκόπηση." };
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { acsVoucherNo: true, shippingGross: true, totalGross: true },
  });

  let built: { email: RenderedEmail } | null = null;
  switch (id) {
    case "order-confirmation":
      built = await buildOrderEmail(orderNumber, { ...opts, preview: { supplier: ctx.variant === "supplier" } });
      break;
    case "payment-success":
      built = await buildOrderEmail(orderNumber, { ...opts, preview: { receipt: true } });
      break;
    case "payment-failed":
      built = await buildPaymentFailedEmail(orderNumber, { statusId: "E" }, opts);
      break;
    case "order-shipped":
      built = await buildShippedEmail(orderNumber, order?.acsVoucherNo || "7400123456", opts);
      break;
    case "order-delivered":
      built = await buildDeliveredEmail(orderNumber, opts);
      break;
    case "order-status":
      built = await buildOrderStatusEmail(orderNumber, "Σε προετοιμασία", opts);
      break;
    case "order-price-correction":
      built = await buildPostageCorrectionEmail(
        orderNumber,
        {
          previousShippingGross: Number(order?.shippingGross ?? 0) + 6.2,
          previousTotalGross: Number(order?.totalGross ?? 0) + 6.2,
        },
        opts,
      );
      break;
    case "review-request":
      built = await buildReviewRequestEmail(orderNumber, { ...opts, preview: true });
      break;
    case "internal-order":
      built = await buildInternalOrderEmail(orderNumber, { assetOrigin: ctx.assetOrigin });
      break;
    case "internal-order-status":
      built = await buildInternalStatusEmail(orderNumber, "Σε προετοιμασία", { assetOrigin: ctx.assetOrigin });
      break;
  }
  if (!built) return { ok: false, error: "Η παραγγελία δεν έχει ό,τι χρειάζεται αυτό το email." };
  return { ok: true, email: built.email, source: `Πραγματική παραγγελία ${orderNumber}` };
}
