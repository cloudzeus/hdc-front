import "server-only";
import { HdctoolError, hdctoolRequestRaw } from "@/lib/hdctool/client";

/**
 * HDCtool's EU-sales surface, as the shop calls it.
 *
 *   POST /api/public/vat/check      the VIES check (HDCtool owns the official
 *                                   sources, the requester VAT and the retries)
 *   POST /api/public/courier/quote  the DHL Express price, with a `country`
 *
 * Both fail CLOSED for the sale: anything that is not a clear answer is
 * `unavailable`, and an unavailable check means VAT is charged. Nothing here
 * decides a VAT mode — it only reports what HDCtool said.
 */

/** Shown when the VIES check could not be done and HDCtool gave no message. */
export const VIES_UNAVAILABLE_MESSAGE =
  "Δεν ήταν δυνατός ο έλεγχος του ΑΦΜ τώρα — δοκιμάστε ξανά σε λίγο ή συνεχίστε με ΦΠΑ";

// VIES retries inside HDCtool (1.5 s, then 4 s), so this waits longer than a quote.
const VAT_TIMEOUT_MS = 20_000;
const QUOTE_TIMEOUT_MS = 15_000;

export type EuVatStatus = "valid" | "invalid" | "unavailable" | "invalid_format";

export type EuVatCheck = {
  status: EuVatStatus;
  name: string | null;
  /** The registered address VIES returned, when it discloses one. */
  address?: string | null;
  consultationNumber: string | null;
  checkedAt: string | null;
  message: string;
};

const VAT_STATUSES: readonly EuVatStatus[] = ["valid", "invalid", "unavailable", "invalid_format"];

type VatBody = {
  status?: unknown;
  name?: unknown;
  address?: unknown;
  consultationNumber?: unknown;
  checkedAt?: unknown;
  message?: unknown;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

function unavailableVat(message?: unknown): EuVatCheck {
  return {
    status: "unavailable",
    name: null,
    consultationNumber: null,
    checkedAt: null,
    message: text(message) ?? VIES_UNAVAILABLE_MESSAGE,
  };
}

/**
 * Ask VIES, through HDCtool, whether `vat` is an active EU VAT number.
 *
 * 200 maps through. 429 (rate limited), 5xx and any network failure are
 * `unavailable`. 400 and 401 are OUR bug (bad request, bad key) and throw an
 * `HdctoolError` rather than pretend the number was checked.
 */
export async function checkEuVat(vat: string, country: string): Promise<EuVatCheck> {
  let response: { status: number; body: VatBody | null };
  try {
    response = await hdctoolRequestRaw<VatBody>(
      "/api/public/vat/check",
      { vat, country },
      { timeoutMs: VAT_TIMEOUT_MS },
    );
  } catch (error) {
    // Our credentials were refused while signing in: ours to fix, not "VIES is down".
    if (error instanceof HdctoolError && (error.status === 400 || error.status === 401)) throw error;
    console.error("[eu-sales] VIES check unreachable", error);
    return unavailableVat();
  }

  const { status, body } = response;

  if (status === 400 || status === 401) {
    throw new HdctoolError(`/api/public/vat/check failed (${status})`, status, "/api/public/vat/check");
  }
  if (status === 429) return unavailableVat(body?.message);
  if (status < 200 || status >= 300) {
    console.error(`[eu-sales] VIES check answered ${status}`);
    return unavailableVat();
  }

  const answered = VAT_STATUSES.find((s) => s === body?.status);
  if (!answered) {
    console.error("[eu-sales] VIES check gave an answer that is not a status", body);
    return unavailableVat();
  }
  if (answered === "unavailable") return unavailableVat(body?.message);

  return {
    status: answered,
    name: text(body?.name),
    address: text(body?.address),
    consultationNumber: text(body?.consultationNumber),
    checkedAt: text(body?.checkedAt),
    message: text(body?.message) ?? "",
  };
}

export type DhlRefusal = "unsupported_country" | "invalid_postcode" | "unserviceable_postcode";

export type DhlQuoteResult =
  | {
      ok: true;
      productCode: string;
      productName: string;
      netAmount: number;
      vatRate: number;
      grossAmount: number;
      /** When we asked, ISO. A quote is only as good as the moment it was made. */
      quotedAt: string;
      estimatedDeliveryDate?: string;
    }
  | { ok: false; reason: DhlRefusal | "unavailable" };

const REFUSALS: readonly DhlRefusal[] = ["unsupported_country", "invalid_postcode", "unserviceable_postcode"];

type QuoteBody = {
  success?: unknown;
  error?: unknown;
  carrier?: unknown;
  productCode?: unknown;
  productName?: unknown;
  netAmount?: unknown;
  vatRate?: unknown;
  grossAmount?: unknown;
  estimatedDeliveryDate?: unknown;
};

const refusalIn = (body: QuoteBody | null): DhlRefusal | null =>
  REFUSALS.find((r) => r === body?.error) ?? null;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * The DHL Express price for a parcel to `country`. `city` is required by DHL
 * for international quotes.
 *
 * A refusal about the PLACE (422) is reported with its reason. Everything else
 * that is not a usable price — 5xx, a timeout, an unknown error, a body
 * without numbers — is `unavailable`: there is no table to fall back on abroad.
 */
export async function quoteDhl(input: {
  country: string;
  postcode: string;
  city: string;
  weightKg: number;
}): Promise<DhlQuoteResult> {
  const quotedAt = new Date().toISOString();

  let response: { status: number; body: QuoteBody | null };
  try {
    response = await hdctoolRequestRaw<QuoteBody>(
      "/api/public/courier/quote",
      {
        country: input.country,
        postcode: input.postcode,
        city: input.city,
        weightKg: input.weightKg,
      },
      { timeoutMs: QUOTE_TIMEOUT_MS },
    );
  } catch (error) {
    console.error("[eu-sales] DHL quote unreachable", error);
    return { ok: false, reason: "unavailable" };
  }

  const { status, body } = response;

  if (status === 422 || (status >= 200 && status < 300 && body?.success === false)) {
    const reason = refusalIn(body);
    if (reason) return { ok: false, reason };
    console.error("[eu-sales] DHL quote refused for an unmapped reason", status, body);
    return { ok: false, reason: "unavailable" };
  }

  if (status < 200 || status >= 300) {
    console.error(`[eu-sales] DHL quote answered ${status}`);
    return { ok: false, reason: "unavailable" };
  }

  if (
    body?.success !== true ||
    body.carrier !== "DHL" ||
    typeof body.productCode !== "string" ||
    typeof body.productName !== "string" ||
    !finite(body.netAmount) ||
    !finite(body.vatRate) ||
    !finite(body.grossAmount)
  ) {
    console.error("[eu-sales] DHL quote answer is not a usable price", body);
    return { ok: false, reason: "unavailable" };
  }

  const estimated = text(body.estimatedDeliveryDate);
  return {
    ok: true,
    productCode: body.productCode,
    productName: body.productName,
    netAmount: body.netAmount,
    vatRate: body.vatRate,
    grossAmount: body.grossAmount,
    quotedAt,
    ...(estimated ? { estimatedDeliveryDate: estimated } : {}),
  };
}
