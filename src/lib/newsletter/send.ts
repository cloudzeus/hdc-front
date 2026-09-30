import "server-only";
import { prisma } from "@/lib/prisma";
import { renderCampaignEmail, type CampaignPayload } from "@/lib/newsletter/campaign";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Αποστολή καμπάνιας μέσω Mailgun.
 *
 * ── Γιατί όχι ένα μήνυμα ανά παραλήπτη ─────────────────────────────────────
 *
 * Επειδή τέσσερις χιλιάδες αιτήματα HTTP είναι τέσσερις χιλιάδες ευκαιρίες να
 * κοπεί η σύνδεση στη μέση, χωρίς να ξέρει κανείς σε ποιον έφτασε. Το Mailgun
 * δέχεται έως 1.000 παραλήπτες ανά κλήση με `recipient-variables`: ένα αίτημα,
 * χίλια ξεχωριστά μηνύματα, ο καθένας βλέπει ΜΟΝΟ τη δική του διεύθυνση στο
 * «Προς».
 *
 * Το `recipient-variables` είναι και ο λόγος που η προσωποποίηση δουλεύει σε
 * μαζική αποστολή: το `%recipient.first_name%` αντικαθίσταται από το Mailgun
 * ανά παραλήπτη, όχι από εμάς.
 */

const ENDPOINT = process.env.MAILGUN_ENDPOINT ?? "https://api.eu.mailgun.net";
const DOMAIN = process.env.MAILGUN_DOMAIN ?? "";
const API_KEY = process.env.MAILGUN_API_KEY ?? "";
const FROM = process.env.MAIL_FROM_MARKETING ?? process.env.MAIL_FROM ?? "Milwaukee Heavy Duty Centre <no-reply@kolleris.com>";

/** Το όριο του Mailgun ανά κλήση. Μεγαλύτερο και το αίτημα απορρίπτεται ολόκληρο. */
const BATCH = 900;

function auth(): string {
  return `Basic ${Buffer.from(`api:${API_KEY}`).toString("base64")}`;
}

export type Recipient = { email: string; name?: string | null; subscriberId?: string | null };

export type SendOutcome = { ok: true; sent: number } | { ok: false; error: string };

/**
 * Ένα δοκιμαστικό, σε μία διεύθυνση.
 *
 * Ξεχωριστό από την πραγματική αποστολή ΜΟΝΟ ως προς τους παραλήπτες: ίδιο
 * template, ίδια δεδομένα, ίδιος renderer. Το «[ΔΟΚΙΜΗ]» μπαίνει στο θέμα ώστε
 * να μη μπερδευτεί με πραγματικό μέσα στα εισερχόμενα, και ΔΕΝ γράφεται
 * παραλήπτης στη βάση — ένα δοκιμαστικό δεν είναι μέρος της αναφοράς.
 */
export async function sendTest(input: {
  to: string;
  templateId: string;
  subject: string;
  preheader?: string;
  locale?: Locale;
  payload: CampaignPayload;
}): Promise<SendOutcome> {
  if (!API_KEY || !DOMAIN) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };

  const email = renderCampaignEmail(input.templateId, input.payload, {
    locale: input.locale ?? "el",
    subject: input.subject,
    preheader: input.preheader,
  });

  const form = new URLSearchParams({
    from: FROM,
    to: input.to,
    subject: `[ΔΟΚΙΜΗ] ${input.subject}`,
    html: email.html,
    text: email.text,
    "o:testmode": "no",
  });

  const res = await fetch(`${ENDPOINT}/v3/${DOMAIN}/messages`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, error: `Mailgun ${res.status}: ${body.message ?? "χωρίς μήνυμα"}` };
  }
  return { ok: true, sent: 1 };
}

/**
 * Η πραγματική αποστολή.
 *
 * Γράφει ΠΡΩΤΑ τους παραλήπτες και μετά στέλνει. Η αντίστροφη σειρά σημαίνει
 * ότι μια διακοπή αφήνει σταλμένα email χωρίς καμία εγγραφή ότι στάλθηκαν — και
 * η επόμενη προσπάθεια τα ξαναστέλνει στους ίδιους ανθρώπους.
 */
export async function sendCampaign(campaignId: string, recipients: Recipient[]): Promise<SendOutcome> {
  if (!API_KEY || !DOMAIN) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };
  if (recipients.length === 0) return { ok: false, error: "Δεν υπάρχουν παραλήπτες." };

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, error: "Η καμπάνια δεν βρέθηκε." };
  if (campaign.status !== "draft") return { ok: false, error: "Η καμπάνια έχει ήδη σταλεί." };

  const payload = campaign.payload as unknown as CampaignPayload;
  const render = (locale: Locale) =>
    renderCampaignEmail(campaign.templateId, payload, {
      locale,
      subject: campaign.subject,
      preheader: campaign.preheader,
    });

  /*
   * Each subscriber in their own language: the editor's words stay as written,
   * the template's (menu, card labels, prices, footer) follow the subscriber.
   * Addresses that are not subscribers (an uploaded list) get Greek.
   */
  const known = await prisma.newsletterSubscriber.findMany({
    where: { email: { in: recipients.map((r) => r.email) } },
    select: { email: true, locale: true },
  });
  const localeByEmail = new Map(known.map((k) => [k.email, k.locale as Locale]));
  const groups = new Map<Locale, Recipient[]>();
  for (const r of recipients) {
    const locale = localeByEmail.get(r.email) ?? "el";
    groups.set(locale, [...(groups.get(locale) ?? []), r]);
  }
  const rendered = new Map(routing.locales.filter((l) => groups.has(l)).map((l) => [l, render(l)]));
  const html = (rendered.get("el") ?? render("el")).html;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: "sending",
      // Το HTML που ΟΝΤΩΣ φεύγει, παγωμένο. Σε έξι μήνες η ερώτηση «τι είδε ο
      // πελάτης» πρέπει να έχει απάντηση, και το πρότυπο θα έχει αλλάξει.
      renderedHtml: html,
      recipientCount: recipients.length,
      sentAt: new Date(),
    },
  });

  await prisma.campaignRecipient.createMany({
    data: recipients.map((r) => ({
      campaignId,
      email: r.email,
      name: r.name ?? null,
      subscriberId: r.subscriberId ?? null,
    })),
    skipDuplicates: true,
  });

  let sent = 0;
  const errors: string[] = [];

  const batches: Array<{ slice: Recipient[]; locale: Locale }> = [];
  for (const [locale, group] of groups) {
    for (let i = 0; i < group.length; i += BATCH) batches.push({ slice: group.slice(i, i + BATCH), locale });
  }

  for (const { slice, locale } of batches) {
    const email = rendered.get(locale)!;
    const vars = Object.fromEntries(
      slice.map((r) => [
        r.email,
        { first_name: (r.name ?? "").split(" ")[0] ?? "", email: r.email },
      ]),
    );

    const form = new URLSearchParams({
      from: FROM,
      subject: campaign.subject,
      html: email.html,
      text: email.text,
      "recipient-variables": JSON.stringify(vars),
      /*
       * Παρακολούθηση ανοιγμάτων και κλικ. Χωρίς αυτά τα δύο, το Events API
       * επιστρέφει μόνο παραδόσεις και η αναφορά δείχνει μηδέν ανοίγματα — που
       * μοιάζει με βλάβη ενώ είναι ρύθμιση.
       */
      "o:tracking-opens": "yes",
      "o:tracking-clicks": "yes",
      "v:campaign-id": campaignId,
    });
    for (const r of slice) form.append("to", r.email);

    const res = await fetch(`${ENDPOINT}/v3/${DOMAIN}/messages`, {
      method: "POST",
      headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(60_000),
    });

    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      sent += slice.length;
      /*
       * Το Mailgun επιστρέφει ΕΝΑ id για όλη την παρτίδα, όχι ένα ανά παραλήπτη.
       * Άρα το `messageId` ΔΕΝ μπορεί να είναι το κλειδί ταιριάσματος των
       * events — η αναφορά ταιριάζει με διεύθυνση, που το Events API επιστρέφει
       * σε κάθε συμβάν. Το id της παρτίδας μένει μόνο στα logs.
       */
      void body.id;
    } else {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      errors.push(`${res.status}: ${body.message ?? "χωρίς μήνυμα"}`);
    }
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: errors.length && sent === 0 ? "failed" : "sent",
      failedCount: recipients.length - sent,
    },
  });

  if (sent === 0) return { ok: false, error: errors[0] ?? "Η αποστολή απέτυχε." };
  return { ok: true, sent };
}
