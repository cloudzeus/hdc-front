import "server-only";
import type {
  AnalysisRawView,
  AnalyzeOk,
  BulkActivateOk,
  OfficialSearchOk,
  TranslateOk,
  AvailabilityCounts,
  AvailabilityRow,
  CategoryChoice,
  ErpPreviewOk,
  ErpRegisterInput,
  ErpRegisterOk,
  ItemContent,
  ItemPatch,
  MilwaukeeOverview,
  OfficialView,
  PeersSuggestion,
  SoftOneCategories,
  SpecLabelRow,
  XmlItemDetail,
  XmlItemRow,
} from "@/lib/hdctool/milwaukee-admin-contract";

/**
 * Client του `/api/hdc-admin/milwaukee/*` του HDCtool: η δουλειά της σελίδας
 * «Milwaukee XML» του HDCtool για το διαχειριστικό του HDC.
 *
 * - Βάση: `HDCTOOL_BASE_URL` (ίδια με τον client του `/api/public/*`).
 * - Κλειδί: `HDC_ADMIN_API_KEY` ως Bearer — γι' αυτό `server-only`.
 * - `X-HDC-Actor`: το email του συνδεδεμένου χρήστη· το HDCtool το γράφει
 *   ως «HDC admin: …» σε εγκρίσεις και καταχωρίσεις.
 *
 * Καμία συνάρτηση δεν πετάει: επιστρέφει `{ ok: true, ... }` ή
 * `{ ok: false, error, status }` με ελληνικό μήνυμα, έτοιμο για τη σελίδα.
 * Κανένα retry: οι εγγραφές δεν είναι ασφαλές να ξανασταλούν στα τυφλά, και
 * το HDCtool απαντά 409 σε διπλή ανάλυση/μετάφραση/ενεργοποίηση. Οι μακριές
 * κλήσεις τρέχουν ως εργασίες στο παρασκήνιο (`milwaukee-admin-jobs.ts`).
 */

export const MISSING_KEY_ERROR = "Λείπει το κλειδί HDC_ADMIN_API_KEY";
export const BAD_KEY_ERROR = "Λείπει ή είναι λάθος το κλειδί HDC_ADMIN_API_KEY";
export const NO_ANSWER_ERROR = "Το HDCtool δεν απάντησε";

const DEFAULT_TIMEOUT_MS = 20_000;
/** Ανάλυση/μετάφραση με AI, αναζήτηση στο επίσημο site και οι υπόλοιπες μαζικές (HDCtool: έως 120″). */
const LONG_TIMEOUT_MS = 130_000;
/** Καταχώριση στο SoftOne και ενεργοποίηση (HDCtool: `maxDuration` 300). */
const VERY_LONG_TIMEOUT_MS = 310_000;

export type MilwaukeeFail = {
  ok: false;
  error: string;
  /** Κωδικός HTTP του HDCtool· 0 όταν δεν απάντησε. 401 και για κλειδί που λείπει. */
  status: number;
  /** Άρνηση της προεπισκόπησης: τι λείπει για την καταχώριση. */
  blockers?: string[];
  /** Άρνηση της καταχώρισης αφού δημιουργήθηκε είδος. */
  mtrl?: number;
};

export type MilwaukeeResult<T extends object = object> = ({ ok: true } & T) | MilwaukeeFail;

/** Σφάλμα κλειδιού (λείπει ή απορρίφθηκε): η σελίδα δείχνει τι να ρυθμιστεί. */
export function isKeyError(result: { ok: boolean; status?: number }): boolean {
  return !result.ok && result.status === 401;
}

/** Χρόνος αναμονής ανά διαδρομή (σχετική με το `/api/hdc-admin/milwaukee/`). */
export function timeoutFor(path: string): number {
  const route = path.split("?")[0]!;
  if (route.endsWith("/erp-register") || route === "bulk/activate") return VERY_LONG_TIMEOUT_MS;
  if (
    route.startsWith("bulk/") ||
    route.endsWith("/analyze") ||
    route.endsWith("/translate") ||
    route.endsWith("/official-search")
  ) {
    return LONG_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

function baseUrl(): string {
  return (process.env.HDCTOOL_BASE_URL ?? "https://hdctool.wwa.gr").replace(/\/+$/, "");
}

const seg = (id: string) => encodeURIComponent(id);

async function call<T extends object>(
  actor: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<MilwaukeeResult<T>> {
  const key = process.env.HDC_ADMIN_API_KEY?.trim();
  if (!key) return { ok: false, status: 401, error: MISSING_KEY_ERROR };
  if (!actor.trim()) return { ok: false, status: 0, error: "Χωρίς συνδεδεμένο χρήστη" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "X-HDC-Actor": actor,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // AbortController + setTimeout (όχι AbortSignal.timeout) για να μετρά ο χρόνος
  // ως το τέλος της ανάγνωσης του σώματος, όχι μόνο ως τα headers.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutFor(path));
  let status: number;
  let text: string;
  try {
    const response = await fetch(`${baseUrl()}/api/hdc-admin/milwaukee/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    status = response.status;
    text = await response.text();
  } catch {
    return { ok: false, status: 0, error: NO_ANSWER_ERROR };
  } finally {
    clearTimeout(timer);
  }

  if (status === 401) return { ok: false, status, error: BAD_KEY_ERROR };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, status, error: `Μη έγκυρη απάντηση από το HDCtool (HTTP ${status})` };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, status, error: `Μη έγκυρη απάντηση από το HDCtool (HTTP ${status})` };
  }

  const { success, error, ...rest } = data as { success?: unknown; error?: unknown } & Record<string, unknown>;
  if (success === true && status >= 200 && status < 300) return { ok: true, ...rest } as MilwaukeeResult<T>;

  const fail: MilwaukeeFail = {
    ok: false,
    status,
    error: typeof error === "string" && error ? error : `Σφάλμα του HDCtool (HTTP ${status})`,
  };
  if (Array.isArray(rest.blockers)) fail.blockers = rest.blockers.filter((b): b is string => typeof b === "string");
  if (typeof rest.mtrl === "number") fail.mtrl = rest.mtrl;
  return fail;
}

// ---------------------------------------------------------------------------
// Αναγνώσεις
// ---------------------------------------------------------------------------

export const getOverview = (actor: string) => call<{ overview: MilwaukeeOverview }>(actor, "GET", "overview");

export const getAvailability = (actor: string) =>
  call<{ counts: AvailabilityCounts; rows: AvailabilityRow[] }>(actor, "GET", "availability");

export const getItems = (actor: string) => call<{ items: XmlItemRow[] }>(actor, "GET", "items");

export const getItem = (actor: string, id: string) => call<{ item: XmlItemDetail }>(actor, "GET", `items/${seg(id)}`);

export const getItemPeers = (actor: string, id: string) =>
  call<{ suggestion: PeersSuggestion }>(actor, "GET", `items/${seg(id)}/peers`);

export const getItemAnalysis = (actor: string, id: string) =>
  call<{ analysis: AnalysisRawView }>(actor, "GET", `items/${seg(id)}/analysis`);

export const getItemOfficial = (actor: string, id: string) =>
  call<{ official: OfficialView }>(actor, "GET", `items/${seg(id)}/official`);

export const getOfficialByCode = (actor: string, code: string) =>
  call<{ official: OfficialView }>(actor, "GET", `official/by-code?${new URLSearchParams({ code })}`);

export const getSoftOneCategories = (actor: string) => call<SoftOneCategories>(actor, "GET", "softone-categories");

export const getSpecLabels = (actor: string) => call<{ labels: SpecLabelRow[] }>(actor, "GET", "spec-labels");

/** Τι θα σταλεί στο SoftOne (ή με ποιο είδος θα συνδεθεί), χωρίς εγγραφή, με το αποτύπωμα. */
export const getErpPreview = (actor: string, id: string) =>
  call<ErpPreviewOk>(actor, "GET", `items/${seg(id)}/erp-preview`);

// ---------------------------------------------------------------------------
// Ενέργειες
// ---------------------------------------------------------------------------

/** Αναζήτηση του κωδικού στο επίσημο site (έως 3 σελίδες· 409 αν τρέχει άλλη). */
export const searchItemOfficial = (actor: string, id: string) =>
  call<OfficialSearchOk>(actor, "POST", `items/${seg(id)}/official-search`);

/** Ξεκινά τη σάρωση του επίσημου site στο παρασκήνιο (202, ή 409 αν τρέχει). */
export const startOfficialSync = (actor: string) => call<{ started: boolean }>(actor, "POST", "official-sync");

export const updateItem = (actor: string, id: string, patch: ItemPatch) =>
  call(actor, "POST", `items/${seg(id)}`, patch);

export const updateItemContent = (actor: string, id: string, content: ItemContent) =>
  call(actor, "POST", `items/${seg(id)}/content`, content);

export const translateItem = (actor: string, id: string) =>
  call<TranslateOk>(actor, "POST", `items/${seg(id)}/translate`);

export const analyzeItem = (actor: string, id: string) =>
  call<AnalyzeOk>(actor, "POST", `items/${seg(id)}/analyze`);

export const registerInErp = (actor: string, id: string, input: ErpRegisterInput) =>
  call<ErpRegisterOk>(actor, "POST", `items/${seg(id)}/erp-register`, input);

export const bulkCategory = (actor: string, ids: string[], choice: CategoryChoice) =>
  call<{ updated: number }>(actor, "POST", "bulk/category", { ids, choice });

export const bulkAcceptSuggested = (actor: string, ids: string[]) =>
  call<{ updated: number }>(actor, "POST", "bulk/accept-suggested", { ids });

export const bulkActivate = (actor: string, ids: string[]) =>
  call<BulkActivateOk>(actor, "POST", "bulk/activate", { ids });

export const bulkArchive = (actor: string, ids: string[]) =>
  call<{ archived: number }>(actor, "POST", "bulk/archive", { ids });

export const approveSpecLabels = (actor: string, rows: Array<{ en: string; el: string }>) =>
  call<{ approved: number; rerendered: number }>(actor, "POST", "spec-labels/approve", { rows });
