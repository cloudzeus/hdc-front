/**
 * Προϊόν μόνο-XML που απέκτησε MTRL στο SoftOne: η γραμμή του (αρνητικό mtrl)
 * παίρνει το πραγματικό MTRL, ώστε slug, κριτικές και αγαπημένα να μείνουν.
 * Αν για κάποιο λόγο υπάρχει ήδη γραμμή με αυτό το MTRL, η γραμμή XML
 * αποσύρεται και κρατιέται εκείνη.
 *
 * Κάθε άλλη γραμμή που κρατά τον κωδικό με άλλο mtrl (ο κωδικός δέθηκε σε άλλο
 * MTRL, ή το item ξαναγεννήθηκε με νέο feedSeq, ή ήρθε ως μόνο-XML ενώ τον
 * είχε γραμμή ERP) τον αφήνει: αρχή είναι το HDCtool, και ένας κωδικός που
 * μένει πιασμένος θα έριχνε το upsert του προϊόντος που τον φέρνει τώρα.
 */
export type RekeyAction =
  | { kind: "move"; id: string; to: number }
  | { kind: "retire"; id: string }
  | { kind: "release"; id: string };

export function planXmlRekey(
  incoming: Array<{ mtrl: number; xmlCode?: string | null }>,
  holders: Array<{ id: string; mtrl: number; xmlCode: string | null }>,
  existingMtrl: Set<number>
): RekeyAction[] {
  const byCode = new Map(holders.filter((r) => r.xmlCode).map((r) => [r.xmlCode!, r]));
  const actions: RekeyAction[] = [];
  for (const p of incoming) {
    if (!p.xmlCode) continue;
    const row = byCode.get(p.xmlCode);
    if (!row) continue;
    byCode.delete(p.xmlCode); // one row, one destination
    if (row.mtrl === p.mtrl) continue;
    if (row.mtrl < 0 && p.mtrl > 0) {
      actions.push(existingMtrl.has(p.mtrl) ? { kind: "retire", id: row.id } : { kind: "move", id: row.id, to: p.mtrl });
    } else {
      actions.push({ kind: "release", id: row.id });
    }
  }
  return actions;
}

/**
 * The unique violation on `products.xmlCode`, as Prisma reports it through the
 * pg adapter: P2002 with the column named in `meta` (older engines put it in
 * `meta.target`; both are covered by looking at the whole `meta`).
 */
export function isXmlCodeClash(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, meta } = error as { code?: unknown; meta?: unknown };
  return code === "P2002" && JSON.stringify(meta ?? null).includes("xmlCode");
}
