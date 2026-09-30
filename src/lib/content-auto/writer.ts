import { z } from "zod";
import { stripFaqSection } from "@/lib/seo/content-files";
import type { Draft, Unsupported } from "@/lib/content-auto/gates";
import { promptPack, type FactPack } from "@/lib/content-auto/fact-pack";

/**
 * The writer and the verifier (spec §5): two DeepSeek calls in JSON mode.
 *
 * The writer sees the fact pack and one existing guide for the voice; the
 * verifier sees the pack and the finished text and lists every claim the pack
 * does not support. The DeepSeek call is passed in (`Chat`), so the tests run
 * on a mock and the runner on `chatJson`. A reply that is not valid JSON of
 * the right shape is asked for once more, then the run fails.
 */

export type ChatResult = { text: string; usage: { promptTokens: number; completionTokens: number } };
export type Chat = (input: { system: string; user: string; maxTokens: number; temperature: number }) => Promise<ChatResult>;

export type StyleExample = { title: string; answer: string; body: string; faq: Array<{ q: string; a: string }> };

const text = (max: number) => z.string().trim().min(1).max(max);

const writerSchema = z.object({
  title: text(200),
  seoTitle: text(200),
  metaDescription: text(400),
  answer: text(3000),
  body: text(100_000),
  faq: z.array(z.object({ q: text(300), a: text(3000) })).min(1).max(12),
  keywords: z.array(text(200)).min(1).max(20),
  entities: z.array(text(200)).max(40).default([]),
  heroProductCode: z.string().trim().max(40).nullish(),
  heroImageAlt: z.string().trim().max(300).nullish(),
  imageAlts: z.array(z.object({ code: z.string().trim().max(40), alt: z.string().trim().max(300) })).max(20).nullish(),
});

export type WriterOutput = {
  draft: Draft;
  heroProductCode: string | null;
  heroImageAlt: string | null;
  imageAlts: Record<string, string>;
};

const verifierSchema = z.object({
  unsupported: z.array(z.object({ claim: text(1000), reason: z.string().trim().max(1000).optional() })).max(50),
});

// ── Prompts ─────────────────────────────────────────────────────────────────

const RULES = [
  "ΚΑΝΟΝΕΣ (απόλυτοι):",
  "1. Γράφεις ΜΟΝΟ από το ΠΑΚΕΤΟ ΣΤΟΙΧΕΙΩΝ. Κάθε αριθμός με μονάδα (V, Ah, Nm, mm, rpm, bpm, J, kg, W, °) πρέπει να υπάρχει στο πακέτο για το ίδιο προϊόν. Ό,τι δεν είναι στο πακέτο δεν το γράφεις — ούτε «από γενική γνώση».",
  "2. Ποτέ τιμές, ευρώ, εκπτώσεις, απόθεμα, διαθεσιμότητα, ποσότητες ή «τεμάχια».",
  "3. Ποτέ «αντιπρόσωπος», «επίσημος αντιπρόσωπος», «εξουσιοδοτημένος», «διανομέας». Ποτέ χονδρική, B2B, «εταιρικοί πελάτες».",
  "4. Ποτέ άλλες μάρκες εργαλείων και ποτέ συγκρίσεις με άλλες μάρκες.",
  "5. Εσωτερικοί σύνδεσμοι ΜΟΝΟ από τη λίστα «σύνδεσμοι» του πακέτου, σε Markdown [κείμενο](/διαδρομή). Το κείμενο του συνδέσμου το γράφεις εσύ, σε σωστά ελληνικά με τόνους (όχι κεφαλαία χωρίς τόνους). Κανένας εξωτερικός σύνδεσμος, καμία εικόνα.",
  "6. Κωδικοί και μοντέλα γράφονται ακριβώς όπως στο πακέτο (π.χ. «M18 FPD3-502X», «4933479859»).",
  "7. Φυσικά ελληνικά, με τόνους, για τεχνίτες. Απάντηση πρώτα (AEO): το answer απαντά ευθέως στο ερώτημα του θέματος.",
  "8. Για το κατάστημα γράφεις μόνο ό,τι λέει το «κατάστημα» του πακέτου: Πειραιάς, παραλαβή, αποστολή σε όλη την Ελλάδα. Χωρίς ωράρια, χρόνους παράδοσης ή ποσά.",
  "9. Οι πρακτικές συμβουλές επιλογής (ποιο για ποια δουλειά) είναι σωστό να υπάρχουν, αλλά χωρίς νέους αριθμούς ή χαρακτηριστικά.",
  "10. Πληθυντικός ευγενείας («διαλέξτε», «δείτε»), όπως στο παράδειγμα ύφους — ποτέ ενικός.",
  "11. Αν δύο στοιχεία του πακέτου αντιφάσκουν (π.χ. σκέτο εργαλείο που στα τεχνικά γράφει μπαταρίες), δεν γράφεις κανένα από τα δύο.",
].join("\n");

const FORMAT = [
  "Απάντησε ΜΟΝΟ με ένα αντικείμενο JSON, με αυτά τα πεδία:",
  '- "title": ο τίτλος (H1), φυσικός, με την κύρια λέξη-κλειδί. Ο τίτλος του θέματος είναι πρόχειρος: γράψε δικό σου.',
  '- "seoTitle": τίτλος για τη Google, ΕΩΣ 60 χαρακτήρες.',
  '- "metaDescription": ΕΩΣ 155 χαρακτήρες.',
  '- "answer": η σύντομη απάντηση, 45–55 λέξεις, μία παράγραφος.',
  '- "body": Markdown, ΤΟΥΛΑΧΙΣΤΟΝ 850 λέξεις, 4–6 ενότητες «## …» διατυπωμένες ως ερωτήσεις, παράγραφοι και λίστες, προαιρετικά ένας πίνακας. ΧΩΡΙΣ H1, χωρίς την απάντηση στην αρχή, χωρίς ενότητα «Συχνές ερωτήσεις».',
  '- "faq": 5–6 αντικείμενα {"q","a"}, απαντήσεις 1–3 προτάσεων.',
  '- "keywords": 6–10 φράσεις αναζήτησης, η κύρια πρώτη (όπως τη γράφει ο κόσμος), μία χωρίς τόνους, μία «… milwaukee».',
  '- "entities": ονόματα και τεχνολογίες που αναφέρονται (Milwaukee, M18 FUEL, μοντέλα).',
  '- "heroProductCode": ο κωδικός του προϊόντος του πακέτου που ταιριάζει ως κεντρική φωτογραφία.',
  '- "heroImageAlt": φυσική ελληνική περιγραφή της φωτογραφίας εκείνου του προϊόντος, με το μοντέλο και το «Milwaukee».',
  '- "imageAlts": [{"code","alt"}] — για κάθε προϊόν που αναφέρεις, φυσική ελληνική περιγραφή της φωτογραφίας του (π.χ. «Κρουστικό δραπανοκατσάβιδο Milwaukee M18 FPD3-502X με δύο μπαταρίες»).',
].join("\n");

export function writerPrompt(pack: FactPack, style: StyleExample | null): { system: string; user: string } {
  const what = pack.articleKind === "GUIDE" ? "οδηγούς αγοράς" : "άρθρα";
  const system = [
    `Είσαι συντάκτης του ελληνικού καταστήματος εργαλείων Milwaukee Heavy Duty Centre στον Πειραιά. Γράφεις ${what} για τεχνίτες, συνεργεία και απαιτητικούς ιδιώτες.`,
    RULES,
    FORMAT,
  ].join("\n\n");
  const example = style
    ? [
        "ΠΑΡΑΔΕΙΓΜΑ ΥΦΟΥΣ — υπάρχων οδηγός του καταστήματος. Μιμήσου το ύφος και τη δομή, ΟΧΙ τα στοιχεία του:",
        `Τίτλος: ${style.title}`,
        `Σύντομη απάντηση: ${style.answer}`,
        style.body.slice(0, 5000),
        ...style.faq.slice(0, 2).map((p) => `Ερώτηση: ${p.q}\nΑπάντηση: ${p.a}`),
      ].join("\n\n")
    : "";
  const user = [
    example,
    `ΘΕΜΑ: ${pack.topic.title}\nΚύρια λέξη-κλειδί: ${pack.topic.keyword}${pack.topic.categoryName ? `\nΚατηγορία: ${pack.topic.categoryName}` : ""}`,
    `ΠΑΚΕΤΟ ΣΤΟΙΧΕΙΩΝ (JSON):\n${JSON.stringify(promptPack(pack))}`,
    "Γράψε το JSON.",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
  return { system, user };
}

export function verifierPrompt(pack: FactPack, draft: Draft, heroAlt: string | null = null): { system: string; user: string } {
  const system = [
    "Είσαι αυστηρός ελεγκτής γεγονότων για ένα ελληνικό κατάστημα εργαλείων Milwaukee.",
    "Σου δίνεται ΠΑΚΕΤΟ ΣΤΟΙΧΕΙΩΝ και ΚΕΙΜΕΝΟ. Βρες κάθε ισχυρισμό του κειμένου για προϊόντα που ΔΕΝ στηρίζεται στο πακέτο:",
    "αριθμοί και μονάδες, χαρακτηριστικά, λειτουργίες, τεχνολογίες, περιεχόμενο κιτ, συμβατότητα, σύγκριση ανάμεσα σε εκδόσεις, στοιχεία για το κατάστημα.",
    "ΔΕΝ είναι ισχυρισμοί προς έλεγχο: γενικές συμβουλές χρήσης και επιλογής, ορισμοί εννοιών (π.χ. τι σημαίνει Nm), προτροπές, διατυπώσεις χωρίς συγκεκριμένο στοιχείο.",
    'Απάντησε ΜΟΝΟ με JSON: {"unsupported":[{"claim":"ο ισχυρισμός όπως γράφεται","reason":"γιατί δεν στηρίζεται"}]} — ή {"unsupported":[]} αν όλα στηρίζονται.',
  ].join("\n");
  const user = [
    `ΠΑΚΕΤΟ ΣΤΟΙΧΕΙΩΝ (JSON):\n${JSON.stringify(promptPack(pack))}`,
    `ΚΕΙΜΕΝΟ:\n# ${draft.title}\n\n${heroAlt ? `![${heroAlt}](κεντρική φωτογραφία)\n\n` : ""}${draft.answer}\n\n${draft.body}\n\n## Συχνές ερωτήσεις\n\n${draft.faq.map((p) => `### ${p.q}\n${p.a}`).join("\n\n")}`,
  ].join("\n\n---\n\n");
  return { system, user };
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/** JSON out of a reply, fences and chatter around it tolerated. */
export function extractJson(reply: string): unknown {
  const trimmed = reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("not JSON");
  }
}

/**
 * What the page will render: no H1, no opening «Σύντομη απάντηση», no images
 * the writer was told not to add, and a «Συχνές ερωτήσεις» section, if it
 * wrote one anyway, moved into `faq` (the page renders it from there).
 */
export function normalizeDraft(d: z.infer<typeof writerSchema>): Draft {
  let body = d.body.replace(/\r\n/g, "\n");
  body = body.replace(/^#\s+.*\n+/gm, "");
  body = body.replace(/^\s*\*{0,2}Σύντομη απάντηση:?\*{0,2}:?.*\n+/i, "");
  body = body.replace(/!\[[^\]]*\]\([^)]*\)\n*/g, "");
  const { body: withoutFaq, faq: bodyFaq } = stripFaqSection(body);
  const faq = d.faq.map((p) => ({ q: p.q.trim(), a: p.a.trim() })).filter((p) => p.q && p.a);
  const clean = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];
  return {
    title: d.title.trim(),
    seoTitle: d.seoTitle.trim(),
    metaDescription: d.metaDescription.trim(),
    answer: d.answer.replace(/^\*{0,2}Σύντομη απάντηση:?\*{0,2}:?\s*/i, "").trim(),
    body: withoutFaq.trim(),
    faq: faq.length ? faq : bodyFaq,
    keywords: clean(d.keywords),
    entities: clean(d.entities),
  };
}

export function parseWriterReply(reply: string): WriterOutput {
  const parsed = writerSchema.parse(extractJson(reply));
  return {
    draft: normalizeDraft(parsed),
    heroProductCode: parsed.heroProductCode?.trim() || null,
    heroImageAlt: parsed.heroImageAlt?.trim() || null,
    imageAlts: Object.fromEntries((parsed.imageAlts ?? []).map((a) => [a.code, a.alt])),
  };
}

export function parseVerifierReply(reply: string): Unsupported[] {
  return verifierSchema.parse(extractJson(reply)).unsupported.map((u) => ({ claim: u.claim, reason: u.reason }));
}

// ── Calls ───────────────────────────────────────────────────────────────────

const tokensOf = (r: ChatResult) => r.usage.promptTokens + r.usage.completionTokens;

/** One call, and one more if the reply does not parse. */
async function withRetry<T>(
  chat: Chat,
  input: Parameters<Chat>[0],
  parse: (reply: string) => T,
): Promise<{ value: T; tokens: number; promptTokens: number; completionTokens: number; attempts: number }> {
  let tokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await chat(
      attempt === 1 ? input : { ...input, user: `${input.user}\n\nΠΡΟΣΟΧΗ: η προηγούμενη απάντηση δεν ήταν έγκυρο JSON με όλα τα πεδία. Επίστρεψε ΜΟΝΟ το αντικείμενο JSON.` },
    );
    tokens += tokensOf(reply);
    promptTokens += reply.usage.promptTokens;
    completionTokens += reply.usage.completionTokens;
    try {
      return { value: parse(reply.text), tokens, promptTokens, completionTokens, attempts: attempt };
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message.slice(0, 300) : String(lastError);
  throw Object.assign(new Error(`Η DeepSeek δεν επέστρεψε έγκυρο JSON (${detail})`), { tokens });
}

export async function writeArticle(
  pack: FactPack,
  style: StyleExample | null,
  chat: Chat,
): Promise<WriterOutput & { tokens: number; promptTokens: number; completionTokens: number; attempts: number }> {
  const { system, user } = writerPrompt(pack, style);
  const { value, ...usage } = await withRetry(chat, { system, user, maxTokens: 8000, temperature: 0.5 }, parseWriterReply);
  return { ...value, ...usage };
}

export async function verifyArticle(
  pack: FactPack,
  draft: Draft,
  chat: Chat,
  heroAlt: string | null = null,
): Promise<{ unsupported: Unsupported[]; tokens: number; promptTokens: number; completionTokens: number }> {
  const { system, user } = verifierPrompt(pack, draft, heroAlt);
  const { value, tokens, promptTokens, completionTokens } = await withRetry(chat, { system, user, maxTokens: 3000, temperature: 0 }, parseVerifierReply);
  return { unsupported: value, tokens, promptTokens, completionTokens };
}
