/**
 * An XML-only product (negative mtrl) has no MTRL in SoftOne for the PIM to
 * write to; its content is edited in HDCtool's Milwaukee XML page. Same shape
 * as the other PIM action errors.
 */
export function xmlOnlyPimError(mtrl: number): { ok: false; error: string } | null {
  return mtrl < 0 ? { ok: false, error: "Προϊόν μόνο-XML: επεξεργασία στο HDCtool → Milwaukee XML" } : null;
}
