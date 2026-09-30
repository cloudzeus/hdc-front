import { z } from "zod";
import { stripFaqSection } from "@/lib/seo/content-files";
import type { Draft, Unsupported } from "@/lib/content-auto/gates";
import { promptPack, type FactPack } from "@/lib/content-auto/fact-pack";
import { cutAtWord } from "@/lib/seo/size-variant";

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
  unsupported: z
    .array(
      z.object({
        claim: text(1000),
        reason: z.string().trim().max(1000).optional(),
        // Missing or unknown kind counts as a fact: fail closed.
        kind: z.enum(["fact", "advice"]).catch("fact").default("fact"),
      }),
    )
    .max(50),
});

// ── Prompts ─────────────────────────────────────────────────────────────────

const RULES = [
  "ΚΑΝΟΝΕΣ (απόλυτοι):",
  "1. Γράφεις ΜΟΝΟ από το ΠΑΚΕΤΟ ΣΤΟΙΧΕΙΩΝ. Κάθε αριθμός με μονάδα (V, Ah, Nm, mm, rpm, bpm, J, kg, W, °) πρέπει να υπάρχει στο πακέτο για το ίδιο προϊόν. Ό,τι δεν είναι στο πακέτο δεν το γράφεις — ούτε «από γενική γνώση».",
  "2. Ποτέ τιμές, ευρώ, εκπτώσεις, απόθεμα, διαθεσιμότητα, ποσότητες ή «τεμάχια».",
  "3. Ποτέ «αντιπρόσωπος», «επίσημος αντιπρόσωπος», «εξουσιοδοτημένος», «διανομέας». Ποτέ χονδρική, B2B, «εταιρικοί πελάτες».",
  "4. Ποτέ άλλες μάρκες εργαλείων και ποτέ συγκρίσεις με άλλες μάρκες — ούτε με ανώνυμα «φθηνότερα», «μικρότερα» ή «ηλεκτρικά με καλώδιο» εργαλεία: συγκρίνεις μόνο τις εκδόσεις του πακέτου μεταξύ τους.",
  "5. Εσωτερικοί σύνδεσμοι ΜΟΝΟ από τη λίστα «σύνδεσμοι» του πακέτου, σε Markdown [κείμενο](/διαδρομή). Το κείμενο του συνδέσμου το γράφεις εσύ, σε σωστά ελληνικά με τόνους (όχι κεφαλαία χωρίς τόνους). Κανένας εξωτερικός σύνδεσμος, καμία εικόνα.",
  "6. Κωδικοί και μοντέλα γράφονται ακριβώς όπως στο πακέτο (π.χ. «M18 FPD3-502X», «4933479859»).",
  "7. Σωστά ελληνικά με τόνους και σωστή ορθογραφία. Απάντηση πρώτα (AEO): το answer απαντά ευθέως στο ερώτημα του θέματος.",
  "8. Για το κατάστημα γράφεις μόνο ό,τι λέει το «κατάστημα» του πακέτου: Πειραιάς, παραλαβή, αποστολή σε όλη την Ελλάδα. Χωρίς ωράρια, χρόνους παράδοσης ή ποσά.",
  "9. Οι πρακτικές συμβουλές επιλογής (ποιο για ποια δουλειά) είναι σωστό να υπάρχουν, αλλά χωρίς νέους αριθμούς ή χαρακτηριστικά.",
  "10. Πληθυντικός ευγενείας («διαλέξτε», «δείτε»), όπως στο παράδειγμα ύφους — ποτέ ενικός.",
  "11. Αν δύο στοιχεία του πακέτου αντιφάσκουν (π.χ. σκέτο εργαλείο που στα τεχνικά γράφει μπαταρίες), δεν γράφεις κανένα από τα δύο. Ένα σκέτο εργαλείο (-0, -0X, -0C) ΠΟΤΕ δεν έχει μπαταρίες, Ah ή φορτιστή· γράψε «χωρίς μπαταρίες και φορτιστή».",
  "12. Ο αυτόματος έλεγχος απορρίπτει, όπου κι αν εμφανιστούν (και σε λέξεις-κλειδιά και alt): «τιμή/τιμές» (ούτε «τιμή ροπής» — γράψε «ροπή»), «ευρώ», «κοστίζει», «απόθεμα», «τεμάχιο/τεμάχια» (γράψε «υλικό»), «κομμάτια», «διαθεσιμότητα», «ετοιμοπαράδοτο», «χονδρική», «αντιπρόσωπος», «εξουσιοδοτημένος», διευθύνσεις site, emoji. Αριθμοί χωρίς μονάδα από 10 και πάνω, ή με «ετών/χρόνια/μήνες», μόνο αν είναι στο πακέτο.",
  "13. Πόσες εκδόσεις υπάρχουν το λέει ΜΟΝΟ το «εκδόσεις.πλήθος» του πακέτου· κάθε έκδοση είναι ένα μοντέλο της λίστας «εκδόσεις.μοντέλα».",
].join("\n");

/*
 * How the text should READ. The rules above keep it true; these keep it from
 * sounding machine-written, which readers notice and which Google's helpful
 * content signals and AI answer engines both discount. Greek-specific on
 * purpose: the tells of generated Greek are mostly translationese.
 */
const STYLE = [
  "ΥΦΟΣ — να διαβάζεται σαν να το έγραψε έμπειρος πωλητής του καταστήματος που ξέρει τα εργαλεία, όχι μηχανή:",
  "1. Εμπορικά ελληνικά με ζωντάνια: μιλάς για τη δουλειά του τεχνίτη (μπετό, σκαλωσιά, πίνακας, σωληνώσεις, συνεργείο), για το τι κερδίζει στην πράξη — χρόνο, λιγότερη κούραση, λιγότερες μπαταρίες στη βαλίτσα. Πείθεις με συγκεκριμένα οφέλη από το πακέτο, όχι με επίθετα.",
  "2. Καθημερινή, φυσική σύνταξη. Ρήματα αντί για ουσιαστικοποιήσεις («τρυπάει γρηγορότερα», όχι «παρέχει αυξημένη απόδοση διάτρησης»). Όχι μεταφρασμένα αγγλικά: όχι «παρέχει», «διαθέτει» σε κάθε πρόταση, «κάνει τη διαφορά», «στο τέλος της ημέρας», «game changer», «επόμενο επίπεδο».",
  "3. ΑΠΑΓΟΡΕΥΕΤΑΙ το κλισέ γεμίσματος: «Στον σημερινό κόσμο», «Ας δούμε», «Ας εξετάσουμε», «Συμπερασματικά», «Εν κατακλείδι», «Είτε είστε… είτε…», «ανακαλύψτε», «απογειώστε», «κορυφαία ποιότητα», «εξαιρετική επιλογή», «ιδανικό για κάθε ανάγκη», «αξιόπιστος σύντροφος», «χωρίς αμφιβολία», «αναμφίβολα».",
  "4. Ρυθμός ανθρώπου: προτάσεις διαφορετικού μήκους, παράγραφοι 2–4 προτάσεων, λίστες μόνο όπου απαριθμείς πράγματα (όχι κάθε ενότητα λίστα). Όχι τριάδες επιθέτων, όχι ρητορικές ερωτήσεις στη σειρά, όχι θαυμαστικά, όχι emoji, όχι παύλες «—» για έμφαση σε κάθε παράγραφο.",
  "5. Κάθε ενότητα ξεκινά με την ουσία (AEO): πρώτη πρόταση = η απάντηση στην ερώτηση του τίτλου της, μετά η εξήγηση. Η σύντομη απάντηση (answer) διαβάζεται αυτόνομα, σαν να την παραθέτει μια μηχανή αναζήτησης.",
  "6. Για τη Google και τα AI (SEO/GEO): η κύρια λέξη-κλειδί στον τίτλο, στην πρώτη πρόταση του answer και σε ένα H2, με φυσικό τρόπο — όχι επανάληψη. Χρησιμοποίησε και τους τρόπους που ψάχνει ο κόσμος (π.χ. «δραπανοκατσάβιδο» και «κατσαβίδι μπαταρίας»). Ονόμασε καθαρά Milwaukee, πλατφόρμα (M12/M18/MX FUEL) και μοντέλα, ώστε το κείμενο να παρατίθεται σωστά.",
  "7. Ερωτήσεις FAQ όπως τις γράφει πραγματικός πελάτης στη Google ή στο κατάστημα («Κάνει για μπετό;», «Ποια μπαταρία να πάρω;»), όχι τυποποιημένες.",
  "8. Κλείσε με μια φυσική πρόταση για το τι να κοιτάξει ο αναγνώστης ή πού θα το δει από κοντά (το κατάστημα στον Πειραιά ή μια σελίδα από τους συνδέσμους) — όχι «μη διστάσετε να επικοινωνήσετε».",
  "9. Μην αναφέρεις ότι το κείμενο γράφτηκε αυτόματα, μη μιλάς για «πακέτο στοιχείων», «δεδομένα» ή «πηγές» — γράφεις ως το κατάστημα (στον αναγνώστη πάντα στον πληθυντικό ευγενείας).",
].join("\n");

const FORMAT = [
  "Απάντησε ΜΟΝΟ με ένα αντικείμενο JSON, με αυτά τα πεδία:",
  '- "title": ο τίτλος (H1), φυσικός, με την κύρια λέξη-κλειδί. Ο τίτλος του θέματος είναι πρόχειρος: γράψε δικό σου.',
  '- "seoTitle": τίτλος για τη Google, ΕΩΣ 60 χαρακτήρες.',
  '- "metaDescription": ΕΩΣ 155 χαρακτήρες.',
  '- "answer": η σύντομη απάντηση, 45–55 λέξεις, μία παράγραφος.',
  '- "body": Markdown, ΤΟΥΛΑΧΙΣΤΟΝ 850 λέξεις, 4–6 ενότητες «## …» διατυπωμένες ως ερωτήσεις, παράγραφοι και λίστες, προαιρετικά ένας πίνακας. ΧΩΡΙΣ H1, χωρίς την απάντηση στην αρχή, χωρίς ενότητα «Συχνές ερωτήσεις».',
  '- "faq": 5–6 αντικείμενα {"q","a"}, απαντήσεις 1–3 προτάσεων.',
  '- "keywords": 6–10 φράσεις αναζήτησης, η κύρια πρώτη (όπως τη γράφει ο κόσμος), μία χωρίς τόνους, μία «… milwaukee». Οι λέξεις-κλειδιά είναι φράσεις αναζήτησης για το προϊόν/θέμα — ποτέ με "τιμή", "φθηνό", "προσφορά", "αγορά online".',
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
    STYLE,
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

export function verifierPrompt(pack: FactPack, draft: Draft, alts: string[] = []): { system: string; user: string } {
  const system = [
    "Είσαι αυστηρός ελεγκτής γεγονότων για ένα ελληνικό κατάστημα εργαλείων Milwaukee.",
    "Σου δίνεται ΠΑΚΕΤΟ ΣΤΟΙΧΕΙΩΝ και ΚΕΙΜΕΝΟ. Βρες κάθε ισχυρισμό του κειμένου για προϊόντα που ΔΕΝ στηρίζεται στο πακέτο:",
    "αριθμοί και μονάδες, χαρακτηριστικά, λειτουργίες, τεχνολογίες, περιεχόμενο κιτ, συμβατότητα, σύγκριση ανάμεσα σε εκδόσεις, στοιχεία για το κατάστημα.",
    "Έλεγξε ΟΛΑ τα μέρη: τίτλο, τίτλο Google, περιγραφή Google, απάντηση, κείμενο, ερωτήσεις, λέξεις-κλειδιά, οντότητες και τις περιγραφές (alt) των φωτογραφιών.",
    "Ένα σκέτο εργαλείο (-0, -0X, -0C) δεν έχει μπαταρίες ούτε φορτιστή: κάθε τέτοιος ισχυρισμός γι' αυτό δεν στηρίζεται.",
    "Οι δηλώσεις του «λεξικό τεχνολογιών Milwaukee (επαληθευμένο)» του πακέτου ΣΤΗΡΙΖΟΝΤΑΙ: είναι ελεγμένο κείμενο για τις τεχνολογίες (FUEL, REDLINK PLUS, M18 κ.λπ.) που αφορούν αυτά τα προϊόντα.",
    "ΔΕΝ είναι ισχυρισμοί προς έλεγχο: γενικές συμβουλές χρήσης και επιλογής, ορισμοί εννοιών (π.χ. τι σημαίνει Nm), προτροπές, διατυπώσεις χωρίς συγκεκριμένο στοιχείο.",
    "Για κάθε εύρημα δώσε kind:",
    '- "fact": τεχνικό στοιχείο, αριθμός, περιεχόμενο κιτ, συμβατότητα, πλήθος εκδόσεων, ότι υπάρχει μια λειτουργία/χαρακτηριστικό, στοιχείο για το κατάστημα.',
    '- "advice": πρακτική συμβουλή χρήσης, ή τυπική εργασία της ίδιας κατηγορίας προϊόντος, χωρίς αριθμό, τεχνικό στοιχείο, λειτουργία, απόδοση ή συμβατότητα. Παραδείγματα advice: «για μεγάλες επιφάνειες δουλέψτε με σταθερή ταχύτητα», «σε συνεργείο σπρώχνει ρινίσματα» (για φυσητήρα), «σε αποθήκη καθαρίζει ράφια» (για φυσητήρα), «στο εργοτάξιο βιδώνει γυψοσανίδες» (για κατσαβίδι).',
    '- Παραμένει "fact" μια χρήση που προϋποθέτει δυνατότητα που δεν είναι στο πακέτο. Παραδείγματα fact: «κόβει μπετό» (για σέγα που δεν δηλώνεται για μπετό), «αντέχει βροχή», «δουλεύει όλη μέρα με μία μπαταρία», «πιο δυνατό από τα φθηνότερα».',
    'Απάντησε ΜΟΝΟ με JSON: {"unsupported":[{"claim":"ο ισχυρισμός όπως γράφεται","reason":"γιατί δεν στηρίζεται","kind":"fact"}]} — ή {"unsupported":[]} αν όλα στηρίζονται.',
  ].join("\n");
  const user = [
    `ΠΑΚΕΤΟ ΣΤΟΙΧΕΙΩΝ (JSON):\n${JSON.stringify(promptPack(pack))}`,
    [
      "ΚΕΙΜΕΝΟ:",
      `Τίτλος: ${draft.title}`,
      `Τίτλος Google: ${draft.seoTitle}`,
      `Περιγραφή Google: ${draft.metaDescription}`,
      `Λέξεις-κλειδιά: ${draft.keywords.join(" · ")}`,
      `Οντότητες: ${draft.entities.join(" · ")}`,
      ...alts.map((a) => `Περιγραφή φωτογραφίας: ${a}`),
      "",
      draft.answer,
      "",
      draft.body,
      "",
      "## Συχνές ερωτήσεις",
      "",
      draft.faq.map((p) => `### ${p.q}\n${p.a}`).join("\n\n"),
    ].join("\n"),
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
const META_MAX = 155;

export function fitMeta(meta: string): string {
  return meta.length <= META_MAX ? meta : `${cutAtWord(meta, META_MAX - 1).replace(/[\s,;:·—–-]+$/, "")}…`;
}

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
    // Over the limit is trimmed at a word, not failed: a revision spent on a
    // few characters tended to bring new problems into the text.
    metaDescription: fitMeta(d.metaDescription.trim()),
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
  return verifierSchema.parse(extractJson(reply)).unsupported.map((u) => ({ claim: u.claim, reason: u.reason, kind: u.kind }));
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

const recheckSchema = z.object({
  results: z.array(z.object({ claim: z.string(), supported: z.boolean() })).max(50),
});

/**
 * The claims the verifier flagged while saying they are supported, asked
 * once more on their own. Returns the ones the re-check calls supported;
 * any doubt (no answer, a claim it does not return) keeps a claim a fact.
 */
export async function recheckClaims(
  pack: FactPack,
  claims: string[],
  chat: Chat,
): Promise<{ supported: string[]; tokens: number }> {
  if (claims.length === 0) return { supported: [], tokens: 0 };
  const system = [
    "Είσαι αυστηρός ελεγκτής γεγονότων. Για ΚΑΘΕ ισχυρισμό της λίστας, απάντησε αν στηρίζεται ΠΛΗΡΩΣ από το ΠΑΚΕΤΟ ΣΤΟΙΧΕΙΩΝ (και το «λεξικό τεχνολογιών» του).",
    "Αν έστω και ένα μέρος του ισχυρισμού δεν στηρίζεται, supported=false.",
    'Απάντησε ΜΟΝΟ με JSON: {"results":[{"claim":"ο ισχυρισμός όπως δόθηκε","supported":true}]}',
  ].join("\n");
  const user = `ΠΑΚΕΤΟ ΣΤΟΙΧΕΙΩΝ (JSON):\n${JSON.stringify(promptPack(pack))}\n\n---\n\nΙΣΧΥΡΙΣΜΟΙ:\n${claims.map((c) => `- ${c}`).join("\n")}`;
  try {
    const { value, tokens } = await withRetry(chat, { system, user, maxTokens: 1500, temperature: 0 }, (reply) => recheckSchema.parse(extractJson(reply)));
    const yes = new Set(value.results.filter((r) => r.supported).map((r) => r.claim.trim()));
    return { supported: claims.filter((c) => yes.has(c.trim())), tokens };
  } catch (error) {
    return { supported: [], tokens: (error as { tokens?: number }).tokens ?? 0 };
  }
}

/** What the writer gets back when a draft fails: its own JSON, and exactly what to fix. */
export function revisionPrompt(
  pack: FactPack,
  style: StyleExample | null,
  previous: WriterOutput,
  failures: string[],
): { system: string; user: string } {
  const { system, user } = writerPrompt(pack, style);
  const json = {
    ...previous.draft,
    heroProductCode: previous.heroProductCode,
    heroImageAlt: previous.heroImageAlt,
    imageAlts: Object.entries(previous.imageAlts).map(([code, alt]) => ({ code, alt })),
  };
  return {
    system,
    user: [
      user.replace(/\n\n---\n\nΓράψε το JSON\.$/, ""),
      `ΤΟ ΠΡΟΗΓΟΥΜΕΝΟ ΣΟΥ JSON:\n${JSON.stringify(json)}`,
      [
        "Ο αυτόματος έλεγχος το απέρριψε για τα εξής, ακριβώς:",
        ...failures.map((f) => `- ${f}`),
        "",
        "ΔΙΟΡΘΩΣΗ: επίστρεψε ΟΛΟ το JSON ξανά, με τα ίδια πεδία. Αφαίρεσε ή αναδιατύπωσε ΜΟΝΟ τα σημεία που αναφέρονται παραπάνω.",
        "ΜΗΝ προσθέσεις κανένα νέο στοιχείο, αριθμό, χαρακτηριστικό ή ισχυρισμό. Ό,τι δεν μπορεί να στηριχτεί στο πακέτο, το βγάζεις.",
        "Κράτησε το υπόλοιπο κείμενο όπως είναι. Κράτα το σώμα τουλάχιστον 850 λέξεις: ό,τι αφαιρείς, αντικατέστησέ το με γενική πρακτική καθοδήγηση χωρίς νέα στοιχεία. Η απάντηση (answer) 45–55 λέξεις.",
      ].join("\n"),
    ].join("\n\n---\n\n"),
  };
}

export async function reviseArticle(
  pack: FactPack,
  style: StyleExample | null,
  previous: WriterOutput,
  failures: string[],
  chat: Chat,
): Promise<WriterOutput & { tokens: number; promptTokens: number; completionTokens: number; attempts: number }> {
  const { system, user } = revisionPrompt(pack, style, previous, failures);
  const { value, ...usage } = await withRetry(chat, { system, user, maxTokens: 8000, temperature: 0.3 }, parseWriterReply);
  return { ...value, ...usage };
}

export async function verifyArticle(
  pack: FactPack,
  draft: Draft,
  chat: Chat,
  alts: string[] = [],
): Promise<{ unsupported: Unsupported[]; tokens: number; promptTokens: number; completionTokens: number }> {
  const { system, user } = verifierPrompt(pack, draft, alts);
  const { value, tokens, promptTokens, completionTokens } = await withRetry(chat, { system, user, maxTokens: 3000, temperature: 0 }, parseVerifierReply);
  return { unsupported: value, tokens, promptTokens, completionTokens };
}
