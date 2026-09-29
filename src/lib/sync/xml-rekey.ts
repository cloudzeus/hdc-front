/**
 * Προϊόν μόνο-XML που απέκτησε MTRL στο SoftOne: η γραμμή του (αρνητικό mtrl)
 * παίρνει το πραγματικό MTRL, ώστε slug, κριτικές και αγαπημένα να μείνουν.
 * Αν για κάποιο λόγο υπάρχει ήδη γραμμή με αυτό το MTRL, η γραμμή XML
 * αποσύρεται και κρατιέται εκείνη.
 */
export type RekeyAction = { kind: "move"; id: string; to: number } | { kind: "retire"; id: string };

export function planXmlRekey(
  incoming: Array<{ mtrl: number; xmlCode?: string | null }>,
  xmlRows: Array<{ id: string; mtrl: number; xmlCode: string | null }>,
  existingMtrl: Set<number>
): RekeyAction[] {
  const byCode = new Map(xmlRows.filter((r) => r.mtrl < 0 && r.xmlCode).map((r) => [r.xmlCode!, r]));
  const actions: RekeyAction[] = [];
  for (const p of incoming) {
    if (p.mtrl <= 0 || !p.xmlCode) continue;
    const row = byCode.get(p.xmlCode);
    if (!row) continue;
    byCode.delete(p.xmlCode); // one row, one destination
    actions.push(existingMtrl.has(p.mtrl) ? { kind: "retire", id: row.id } : { kind: "move", id: row.id, to: p.mtrl });
  }
  return actions;
}
