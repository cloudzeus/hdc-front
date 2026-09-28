import { z } from "zod";
import { SHOP } from "@/config/shop";

/**
 * What the checkout form may submit, and what it must.
 *
 * Out of `actions.ts` because a "use server" module may export only async
 * functions, and this has to be importable by a unit test.
 *
 * The delivery address is required for everything EXCEPT collection from the
 * shop. The HDC checkout asks for the pickup choice before the address and
 * hides the address altogether when the customer is coming in (checkout.html,
 * screen 2) — so a pickup order arrives with no address, and that is correct.
 * Every other method still needs street, city and a postcode, and the server,
 * not the hidden fieldset, is what says so.
 */

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const checkoutSchema = z
  .object({
    email: z.email().max(320),
    phone: z.string().trim().min(8).max(64),
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),

    shipLine1: optionalText(255),
    shipLine2: optionalText(255),
    shipCity: optionalText(120),
    shipPostcode: optionalText(16),
    /** Νομός. */
    shipRegion: optionalText(120),
    /** Περιφέρεια. */
    shipAdminRegion: optionalText(120),

    wantsInvoice: z.union([z.literal("on"), z.literal("")]).optional(),
    companyName: optionalText(255),
    vatNumber: optionalText(32),
    taxOffice: optionalText(120),
    companyTrade: optionalText(255),
    /// Set by the ΑΦΜ lookup when HDCtool already knows this company.
    erpTrdr: z.coerce.number().int().positive().optional().or(z.literal("")),

    shippingMethod: z.string().max(32),
    paymentMethod: z.string().max(32),
    notes: optionalText(2000),
    terms: z.union([z.literal("on"), z.literal("")]).optional(),
    locale: z.string().max(5).optional(),

    /**
     * An account, if the customer wants one — optional, and empty for everybody
     * who does not. Eight characters is the same floor `setNewPassword`
     * enforces.
     */
    password: z.string().min(8).max(200).optional().or(z.literal("")),
  })
  .superRefine((input, ctx) => {
    if (input.shippingMethod === "pickup") return;
    // The same minimums the address fields always had.
    const need: Array<[keyof typeof input, number]> = [
      ["shipLine1", 3],
      ["shipCity", 2],
      ["shipPostcode", 4],
    ];
    for (const [field, min] of need) {
      const value = String(input[field] ?? "").trim();
      if (value.length < min) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: value ? `Τουλάχιστον ${min} χαρακτήρες` : "Απαιτείται",
        });
      }
    }
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/**
 * The address an order is stored with.
 *
 * The order row keeps a delivery address in NOT NULL columns, and the ERP
 * intake sends one. For collection from the shop the goods are delivered to
 * the shop, so that is the address written — never an empty string, and never
 * whatever a hidden field happened to hold.
 */
export function deliveryAddress(input: CheckoutInput) {
  if (input.shippingMethod === "pickup") {
    return {
      shipLine1: SHOP.contact.street,
      shipLine2: null,
      shipCity: SHOP.contact.city,
      shipPostcode: SHOP.contact.postcode,
      shipRegion: null,
      shipAdminRegion: null,
    };
  }
  return {
    shipLine1: (input.shipLine1 ?? "").trim(),
    shipLine2: input.shipLine2 || null,
    shipCity: (input.shipCity ?? "").trim(),
    shipPostcode: (input.shipPostcode ?? "").trim(),
    shipRegion: input.shipRegion || null,
    shipAdminRegion: input.shipAdminRegion || null,
  };
}
