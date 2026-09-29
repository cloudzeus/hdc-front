/**
 * English and Italian names for HDCtool's Milwaukee category tree — the one
 * GET /api/public/milwaukee-categories serves.
 *
 * Most groups and subgroups had the Greek name copied into the English and
 * Italian fields (HDCtool's ERP sync creates rows that way), and 18 of the 19
 * categories had Italian names prefixed "CATEGORIA: ", left over from an old
 * machine translation.
 *
 * Two steps, run from the HDCtool checkout with HDCtool's .env:
 *
 *   cd /Volumes/EXTERNALSSD/hdckolleris/hdckolleris
 *   npx tsx --env-file=.env /Volumes/EXTERNALSSD/hdc-front/scripts/hdctool/translate-milwaukee-categories.ts
 *     → translates what is missing with DeepSeek (HDCtool's own translator)
 *       and writes docs/content/milwaukee-category-translations.json.
 *       Nothing is written to the database.
 *   npx tsx --env-file=.env …/translate-milwaukee-categories.ts --apply
 *     → backs up the rows it touches, then writes the reviewed file in one
 *       transaction to milwaukee_categories AND to the soft classification
 *       tables (SoftCategory by CODE, SoftGroup by CODE, SoftSubgroup by
 *       SHORT + MTRGROUP), because the admin's "sync" rebuilds the Milwaukee
 *       tree from those — a translation only in the tree would be wiped by the
 *       next sync. The ERP sync owns the Greek name only and leaves these alone.
 *
 * Only missing values are filled: a name that is empty, Greek, a copy of the
 * Greek, prefixed ("Sottogruppo: …") or all capitals. The one exception is
 * docs/content/milwaukee-category-corrections.json — checked names that also
 * replace an existing value when it was wrong ("Gas Pliers" for γκαζοτανάλιες).
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(__dirname, "../../docs/content/milwaukee-category-translations.json");
const CORRECTIONS = path.resolve(__dirname, "../../docs/content/milwaukee-category-corrections.json");
const APPLY = process.argv.includes("--apply");
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const BATCH = 40;

type Kind = "CATEGORY" | "GROUP" | "SUBGROUP";
type Proposal = {
  id: string;
  erpType: Kind;
  erpCode: string;
  /** The parent's erpCode — a subgroup's SHORT is only unique inside its group. */
  parentCode: string | null;
  el: string;
  en: string | null;
  it: string | null;
  /** Set when a checked correction replaces a value that was not missing but wrong. */
  forceEn?: boolean;
  forceIt?: boolean;
};

/** True when the field holds no usable translation of `greek`. */
function missing(value: string | null | undefined, greek: string): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  if (GREEK.test(v)) return true;
  // A machine-translation prefix: "CATEGORIA: Foratura", "Sottogruppo: GINOCCHIERE".
  if (/^\s*(CATEGOR(Y|IA)|GROUP|GRUPPO|SUBGROUP|SOTTOGRUPPO)\s*:/i.test(v)) return true;
  // Shouted: "SAFETY GLASSES". Acronyms alone ("TORX", "HSS") are fine.
  if (v === v.toUpperCase() && /[A-Z]{3,}[^A-Z]+[A-Z]{3,}/.test(v)) return true;
  // A Latin-only Greek name ("TORX", "HSS") is its own translation.
  return v === greek.trim() && GREEK.test(greek);
}

const brokenItalian = (value: string | null | undefined) => /^\s*(CATEGORIA|GRUPPO|SOTTOGRUPPO)\s*:/i.test(value ?? "");

/**
 * Greek trade words a general translator gets wrong. Found in the first run:
 * σέγα/σπαθόσεγα came out swapped, πριτσίνωμα became "pruning", αλοιφαδόρος
 * became "lubricator", κουρευτικό περιθωρίων became an edge router.
 */
const GLOSSARY = `ΣΕΓΑ = jigsaw (seghetto alternativo); ΣΠΑΘΟΣΕΓΑ = reciprocating saw (seghetta a gattuccio);
ΔΙΣΚΟΠΡΙΟΝΟ = circular saw (sega circolare); ΦΑΛΤΣΟΠΡΙΟΝΟ = mitre saw (troncatrice);
ΠΙΣΤΟΛΕΤΟ = rotary hammer (tassellatore); ΚΑΤΕΔΑΦΙΣΤΙΚΟ / ΚΑΤΕΔΑΦΙΣΤΗΣ = demolition hammer (martello demolitore);
ΔΡΑΠΑΝΟΚΑΤΣΑΒΙΔΟ = drill driver (trapano avvitatore); ΠΑΛΜΙΚΟ ΚΑΤΣΑΒΙΔΙ = impact driver (avvitatore a impulsi);
ΜΠΟΥΛΟΝΟΚΛΕΙΔΟ = impact wrench (avvitatore a massa battente); ΚΑΣΤΑΝΙΑ = ratchet (cricchetto);
ΓΩΝΙΑΚΟΣ ΤΡΟΧΟΣ = angle grinder (smerigliatrice angolare); ΕΥΘΥΣ ΛΕΙΑΝΤΗΡΑΣ = die grinder (smerigliatrice diritta);
ΑΛΟΙΦΑΔΟΡΟΣ = polisher (lucidatrice); ΣΑΤΙΝΙΕΡΑ = burnisher (satinatrice);
ΕΚΚΕΝΤΡΟ ΤΡΙΒΕΙΟ = random orbital sander (levigatrice rotorbitale); ΤΡΙΒΕΙΟ = sander (levigatrice); ΤΑΙΝΙΟΛΕΙΑΝΤΗΡΑΣ = belt sander;
ΠΑΛΜΙΚΟ ΠΟΛΥΕΡΓΑΛΕΙΟ = oscillating multi-tool (utensile multifunzione oscillante);
ΠΡΙΤΣΙΝΩΜΑ = riveting (rivettatura); ΠΡΙΤΣΙΝΑΔΟΡΟΣ = rivet tool;
ΦΑΚΟΣ (in lighting) = torch / work light (torcia, lampada); ΑΝΤΙΕΚΡΗΚΤΙΚΟΣ = explosion-proof (antideflagrante); ΠΡΟΒΟΛΕΑΣ = floodlight;
ΚΟΥΡΕΥΤΙΚΟ ΠΕΡΙΘΩΡΙΩΝ = edge trimmer / strimmer (tagliabordi); ΘΑΜΝΟΚΟΠΤΙΚΟ = hedge trimmer; ΑΛΥΣΟΠΡΙΟΝΟ = chainsaw; ΦΥΣΗΤΗΡΑΣ = blower;
ΤΡΥΠΑΝΙ = drill bit (punta); ΠΟΤΗΡΟΤΡΥΠΑΝΟ = hole saw (sega a tazza); ΜΥΤΗ = bit (inserto); ΚΑΡΟΤΙΕΡΑ = core drill;
ΥΠΟΔΟΧΗ SDS-PLUS / SDS-MAX (for bits or tools) = SDS-Plus / SDS-Max; ΕΞΑΓΩΝΗ ΥΠΟΔΟΧΗ = hex shank;
ΣΜΥΡΙΔΟΔΙΣΚΟΣ ΚΟΠΗΣ = cut-off wheel (disco da taglio); ΔΙΣΚΟΣ ΛΕΙΑΝΣΗΣ = grinding disc;
ΣΥΣΦΙΞΗ = clamping (serraggio); ΧΑΡΑΞΗ = marking out (tracciatura); ΑΜΠΕΡΟΤΣΙΜΠΙΔΑ = clamp meter;
ΠΡΕΣΑ ΑΚΡΟΔΕΚΤΩΝ = crimping tool (pinza crimpatrice); ΚΑΡΦΩΤΙΚΟ = nailer (chiodatrice); ΣΚΑΦΑΚΙ = tool tray / organiser;
ΕΡΓΑΛΕΙΟΦΟΡΟΣ = tool chest / roller cabinet (carrello porta utensili); ΜΑΤΣΟΛΑ = sledgehammer (mazza);
ΛΟΙΠΑ / ΛΟΙΠΟΙ = other (altri); ΔΙΑΦΟΡΑ = miscellaneous (varie); ΑΠΛΑ = standard (standard).`;

type Item = { el: string; path: string };

async function deepseek(items: Item[]): Promise<Array<{ en: string; it: string }>> {
  const url = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set in HDCtool's .env");

  const system =
    `You translate category names of a Milwaukee tool shop catalogue (power tools, hand ` +
    `tools, accessories, PPE, storage, lighting, garden) from Greek into English and Italian, ` +
    `using the words a professional tool retailer uses. Each item gives the Greek name and its ` +
    `parent path for context; translate only the name.\n` +
    `English: Title Case ("Random Orbital Sanders Ø125"). Italian: capitalise the first word only.\n` +
    `Never write in all capitals. Keep brand and product terms as they are (Milwaukee, M12, M18, ` +
    `MX FUEL, PACKOUT, ONE-KEY, SDS-Plus, SDS-Max, HSS, TORX, EPTA, LED, laser). Write Φ as Ø. ` +
    `Where the Greek separates items with " - " or "-", use " – ". Never add a prefix such as ` +
    `"Category:". Use plural for product groups.\nGlossary:\n${GLOSSARY}\n` +
    `Answer with a JSON array with one {"en": "...", "it": "..."} object per input, same order, nothing else.`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(items) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const text = body.choices[0].message.content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const out = JSON.parse(text) as Array<{ en?: unknown; it?: unknown }>;
  if (!Array.isArray(out) || out.length !== items.length) {
    throw new Error(`DeepSeek returned ${Array.isArray(out) ? out.length : "no"} items for ${items.length}`);
  }
  const strip = (v: unknown) => String(v ?? "").replace(/^\s*(CATEGORIA|CATEGORY|CATEGORIE)\s*:\s*/i, "").trim();
  return out.map((o, i) => {
    const en = strip(o.en);
    const it = strip(o.it);
    for (const v of [en, it]) {
      if (!v || GREEK.test(v)) throw new Error(`Bad translation for ${items[i].el}: "${v}"`);
    }
    return { en, it };
  });
}

async function translateAll(items: Item[]): Promise<Map<string, { en: string; it: string }>> {
  const seen = new Map<string, Item>();
  for (const item of items) seen.set(`${item.path}|${item.el}`, item);
  const unique = [...seen.values()];
  const result = new Map<string, { en: string; it: string }>();
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const translated = await deepseek(chunk);
    chunk.forEach((item, k) => result.set(`${item.path}|${item.el}`, translated[k]));
    console.log(`  ${Math.min(i + BATCH, unique.length)}/${unique.length}`);
  }
  return result;
}

async function main() {
  const { prisma } = await import(path.join(process.cwd(), "src/lib/prisma"));
  const rows: Array<{
    id: string;
    parentId: string | null;
    erpCode: string;
    erpType: Kind;
    nameGreek: string;
    nameEnglish: string;
    nameItalian: string;
  }> = await prisma.milwaukeeCategory.findMany({
    select: { id: true, parentId: true, erpCode: true, erpType: true, nameGreek: true, nameEnglish: true, nameItalian: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  if (!APPLY) {
    const needEn = rows.filter((r) => missing(r.nameEnglish, r.nameGreek));
    const needIt = rows.filter((r) => missing(r.nameItalian, r.nameGreek) || brokenItalian(r.nameItalian));
    console.log(`${rows.length} rows · English missing ${needEn.length} · Italian missing or broken ${needIt.length}`);

    const pathOf = (r: (typeof rows)[number]): string => {
      const parts: string[] = [];
      let at = r.parentId ? byId.get(r.parentId) : undefined;
      while (at) {
        parts.unshift(at.nameGreek);
        at = at.parentId ? byId.get(at.parentId) : undefined;
      }
      return parts.join(" > ");
    };
    const wanted = rows.filter((r) => needEn.includes(r) || needIt.includes(r));
    const translated = await translateAll(wanted.map((r) => ({ el: r.nameGreek, path: pathOf(r) })));

    const corrections = JSON.parse(fs.readFileSync(CORRECTIONS, "utf8")) as Record<string, { en?: string; it?: string }>;
    const proposals: Proposal[] = [];
    for (const r of rows) {
      const t = translated.get(`${pathOf(r)}|${r.nameGreek}`);
      const fix = corrections[r.nameGreek.trim()];
      let en = needEn.includes(r) ? (t?.en ?? null) : null;
      let it = needIt.includes(r) ? (t?.it ?? null) : null;
      let forceEn = false;
      let forceIt = false;
      if (fix?.en && fix.en !== r.nameEnglish) {
        forceEn = !needEn.includes(r);
        en = fix.en;
      }
      if (fix?.it && fix.it !== r.nameItalian) {
        forceIt = !needIt.includes(r);
        it = fix.it;
      }
      if (!en && !it) continue;
      proposals.push({
        id: r.id,
        erpType: r.erpType,
        erpCode: r.erpCode,
        parentCode: r.parentId ? (byId.get(r.parentId)?.erpCode ?? null) : null,
        el: r.nameGreek,
        en,
        it,
        ...(forceEn ? { forceEn } : {}),
        ...(forceIt ? { forceIt } : {}),
      });
    }
    fs.writeFileSync(OUT, JSON.stringify(proposals, null, 1) + "\n");
    console.log(`\n${proposals.length} proposals → ${OUT}\nNothing written. Review, then re-run with --apply.`);
    return;
  }

  const proposals = JSON.parse(fs.readFileSync(OUT, "utf8")) as Proposal[];
  const backup: Record<string, unknown[]> = { milwaukee: [], softCategory: [], softGroup: [], softSubgroup: [] };
  const counts = { milwaukee: 0, softCategory: 0, softGroup: 0, softSubgroup: 0 };

  // Read everything the transaction will touch, for the backup and the "only if missing" rule.
  const soft = {
    CATEGORY: await prisma.softCategory.findMany({ where: { CODE: { in: proposals.filter((p) => p.erpType === "CATEGORY").map((p) => p.erpCode) } } }),
    GROUP: await prisma.softGroup.findMany({ where: { CODE: { in: proposals.filter((p) => p.erpType === "GROUP").map((p) => p.erpCode) } } }),
    SUBGROUP: await prisma.softSubgroup.findMany({ where: { SHORT: { in: proposals.filter((p) => p.erpType === "SUBGROUP").map((p) => p.erpCode) } } }),
  };

  const writes: Array<(tx: typeof prisma) => Promise<unknown>> = [];
  for (const p of proposals) {
    const row = byId.get(p.id);
    if (!row) continue;
    const data: Record<string, string> = {};
    if (p.en && (p.forceEn || missing(row.nameEnglish, row.nameGreek))) data.nameEnglish = p.en;
    if (p.it && (p.forceIt || missing(row.nameItalian, row.nameGreek) || brokenItalian(row.nameItalian))) data.nameItalian = p.it;
    if (Object.keys(data).length) {
      backup.milwaukee.push(row);
      counts.milwaukee++;
      writes.push((tx) => tx.milwaukeeCategory.update({ where: { id: p.id }, data }));
    }

    type SoftRow = { id: string; NAMEGREEK: string; NAMEENGLISH: string; NAMEITALIAN: string; CODE?: string; SHORT?: string; MTRGROUP?: string };
    const candidates = (soft[p.erpType] as SoftRow[]).filter((s) =>
      p.erpType === "SUBGROUP" ? s.SHORT === p.erpCode && s.MTRGROUP === p.parentCode : s.CODE === p.erpCode,
    );
    for (const s of candidates) {
      const softData: Record<string, string> = {};
      if (p.en && (p.forceEn || missing(s.NAMEENGLISH, s.NAMEGREEK))) softData.NAMEENGLISH = p.en;
      if (p.it && (p.forceIt || missing(s.NAMEITALIAN, s.NAMEGREEK) || brokenItalian(s.NAMEITALIAN))) softData.NAMEITALIAN = p.it;
      if (!Object.keys(softData).length) continue;
      const table = p.erpType === "CATEGORY" ? "softCategory" : p.erpType === "GROUP" ? "softGroup" : "softSubgroup";
      backup[table].push(s);
      counts[table]++;
      writes.push((tx) => (tx as unknown as Record<string, { update: (a: unknown) => Promise<unknown> }>)[table].update({ where: { id: s.id }, data: softData }));
    }
  }

  const backupFile = OUT.replace(/\.json$/, `.backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 1));
  console.log(`Backup: ${backupFile}`);

  await prisma.$transaction(async (tx: typeof prisma) => {
    for (const write of writes) await write(tx);
  }, { timeout: 120_000 });
  console.log(`Written: ${JSON.stringify(counts)}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
