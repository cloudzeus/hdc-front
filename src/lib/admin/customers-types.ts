/**
 * Customer-screen shapes.
 *
 * Split from the query module so a client component can import them without
 * pulling in `server-only` and Prisma — same split as the inbox and the zone
 * registry.
 *
 * Το HDC πουλά μόνο σε ιδιώτες (spec Δ2): δεν υπάρχει πια ουρά έγκρισης
 * εταιρειών. Οι πίνακες εταιρειών της βάσης μένουν ως έχουν.
 *
 * Client-safe: no Prisma, no network.
 */

export type IndividualRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  createdAt: Date;
  orders: number;
};

export type CustomersPage = {
  individuals: IndividualRow[];
  /** Όλοι οι ιδιώτες, όχι μόνο όσοι χωράνε στη λίστα. */
  total: number;
};
