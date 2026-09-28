/**
 * Suggest constants shared by the server query and the header dropdown.
 *
 * Separate from `suggest.ts` for the same reason as everywhere else here: that
 * module is `server-only`, and importing it from the client component would
 * drag Prisma into the browser bundle.
 */

/** Below this a query matches most of the catalogue and helps nobody. */
export const SUGGEST_MIN_LENGTH = 2;

/** Rows the dropdown shows before deferring to the results page (search.html §1). */
export const SUGGEST_MODEL_LIMIT = 3;
export const SUGGEST_ACCESSORY_LIMIT = 4;
export const SUGGEST_CATEGORY_LIMIT = 3;
export const SUGGEST_DID_YOU_MEAN_LIMIT = 4;

/** Debounce before the request goes out, ms. */
export const SUGGEST_DEBOUNCE_MS = 180;

/** The platform chips, in the order the shop sells them. */
export const SUGGEST_PLATFORMS = ["M12", "M18", "MX"] as const;
export const platformLabel = (p: string) => (p === "MX" ? "MX FUEL" : p);
