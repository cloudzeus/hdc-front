/**
 * A model's address: «M18 FPD3» ↔ /montelo/m18-fpd3.
 *
 * A model root is the platform prefix (M12, M18, MXF), a space and a model
 * that starts with a letter and holds only letters and digits
 * (src/lib/milwaukee/model.ts) — so one hyphen in the slug is unambiguous.
 */
const SLUG = /^(m12|m18|mxf)-([a-z][a-z0-9]*)$/i;

export function modelSlug(root: string): string {
  return root.trim().replace(/\s+/, "-").toLowerCase();
}

export function modelRootFromSlug(slug: string): string | null {
  const match = SLUG.exec(slug.trim());
  return match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}` : null;
}

export function modelPath(root: string): string {
  return `/montelo/${modelSlug(root)}`;
}
