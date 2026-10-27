"use server";

import { redirect } from "next/navigation";
import { hash as hashPassword } from "@node-rs/argon2";
import { sendOrderEmail } from "@/lib/mail/order-email";
import { sendInternalOrderEmail } from "@/lib/mail/order-internal-email";
import { randomBytes } from "node:crypto";
import { checkoutSchema, deliveryAddress } from "@/lib/checkout/schema";
import { orderLineIds } from "@/lib/checkout/line-ids";
import { parseRequestMode, planCheckout, requestPath } from "@/lib/requests/model";
import { createRequestOrder, type OrderBase } from "@/lib/requests/create";
import { announceNewRequest } from "@/lib/requests/service";
import type { CartLineView } from "@/lib/cart/options";
import { prisma } from "@/lib/prisma";
import { STOCK_HOLD_HOURS, holdExpiry } from "@/lib/orders/hold";
import { computeTotals, getCart, getCartToken } from "@/lib/cart/cart";
import { PAYMENT_METHODS, SHIPPING_METHODS, shippingMethodsFor } from "@/lib/cart/options";
import { orderAvailability } from "@/lib/catalog/availability";
import { isUnserviceable, quoteLivePostage } from "@/lib/shipping/acs-live";
import { checkDestination, destinationMessage, shippingCopy } from "@/lib/shipping/destination";
import { isInternationalShippingEnabled } from "@/lib/shipping/flag";
import { normalizeCountry, validateCountryPostcode } from "@/lib/shipping/countries";
import { isQuoteUnavailable, isRefused, quoteDestination } from "@/lib/shipping/courier-quote";
import { internationalCopy } from "@/lib/shipping/international-copy";
import { createPaymentOrder, isVivaConfigured } from "@/lib/payment/viva";
import { chargeableWeight } from "@/lib/shipping/acs-tariff";
import { vatRateForDestination } from "@/lib/shipping/vat";
import { isEuSalesEnabled } from "@/lib/eu-sales/flag";
import { euSalesShippingMethods, normalizeEuSalesCountry, vatPrefixFor } from "@/lib/eu-sales/countries";
import { euSalesCopy, vatExample } from "@/lib/eu-sales/copy";
import { normaliseEuVat } from "@/lib/eu-sales/vat-format";
import { resolveVatMode, type CustomerType } from "@/lib/eu-sales/vat-mode";
import { writeEuBuyer } from "@/lib/eu-sales/buyer-cookie";
import { checkEuVat, quoteDhl, type DhlQuoteResult, type EuVatCheck } from "@/lib/eu-sales/hdctool-eu";
import { routing, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/account/session";
import { SHOP } from "@/config/shop";
import { PRIMARY_PHONE } from "@/config/shop";

/**
 * Order placement.
 *
 * Everything is recomputed here from the database — prices, postage, VAT,
 * totals. The form supplies only the address, the choices and the consent. A
 * disabled submit button is a UX affordance; this is the actual control.
 */

/*
 * The schema lives in `./schema` (a "use server" module may only export async
 * functions, and the pickup rule needs a unit test). Delivery address fields
 * are required there for every method except collection from the shop.
 */

/**
 * How long the Viva payment code stays valid: exactly as long as the hold.
 *
 * Derived from `STOCK_HOLD_HOURS` rather than chosen separately. It used to be
 * seven days while the hold was three hours, and a payment link that outlives
 * the hold is worse than a short one — it invites a transfer for goods released
 * to somebody else days earlier, so the money arrives for an order that cannot
 * be filled.
 */
const BANK_TRANSFER_WINDOW_MINUTES = STOCK_HOLD_HOURS * 60;

export type CheckoutState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** HDC-YYYYMMDD-NNNN, sequential within the day. */
async function nextOrderNumber(): Promise<string> {
  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const prefix = `${SHOP.orderPrefix}${day}-`;

  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  const next = last ? Number.parseInt(last.orderNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function placeOrder(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { error: "Ελέγξτε τα στοιχεία σας.", fieldErrors };
  }
  const input = parsed.data;

  // The checkbox is disabled client-side too, but that is decoration.
  if (input.terms !== "on") {
    return {
      error: "Πρέπει να αποδεχτείτε τους όρους χρήσης.",
      fieldErrors: { terms: "Απαιτείται" },
    };
  }

  const address = deliveryAddress(input);

  const locale = (routing.locales.includes(input.locale as Locale)
    ? input.locale
    : routing.defaultLocale) as Locale;

  /*
   * Greece only (see `lib/shipping/destination`). There is no country field,
   * so an address abroad arrives looking domestic; its postcode and its words
   * are what give it away. Checked before anything is priced or written — a
   * pickup order carries the shop's own address and passes.
   */
  /*
   * The delivery country (docs/dhl-express.md §4). With the flag off there is
   * no selector and the posted field is ignored: Greece, and the checks below
   * are exactly the ones above. With it on: Greece and Cyprus go with ACS, the
   * rest of the EU with DHL Express, and anything else is refused. A pickup
   * order carries the shop's own address, so it is Greek whatever was chosen.
   */
  const international = isInternationalShippingEnabled();
  const intl = internationalCopy(locale);
  /*
   * EU sales (EU_SALES_ENABLED, spec 2026-10-23 §3): Greece, or an EU country
   * other than Greece and Cyprus with DHL only. Off: exactly the lines below
   * it had before.
   */
  const euSales = isEuSalesEnabled();
  const eu = euSalesCopy(locale);
  const chosenCountry = euSales
    ? normalizeEuSalesCountry(input.shipCountry)
    : international
      ? normalizeCountry(input.shipCountry, true)
      : "GR";
  if (!chosenCountry) {
    return { error: intl.country, fieldErrors: { shipCountry: intl.country } };
  }
  const country = input.shippingMethod === "pickup" ? "GR" : chosenCountry;
  const abroad = country !== "GR";
  /* A foreign delivery under EU sales: «Ιδιώτης / Εταιρεία», VIES and DHL. */
  const euAbroad = euSales && abroad;

  /*
   * Who is buying. In Greece «Θέλω τιμολόγιο», as always. Abroad (EU sales)
   * the «Ιδιώτης / Εταιρεία» choice replaces it: a company is invoiced, with
   * its VAT number kept WITH its country prefix.
   */
  const postedInvoice = input.wantsInvoice === "on";
  const customerType: CustomerType = euAbroad
    ? input.customerType === "company"
      ? "company"
      : "individual"
    : postedInvoice
      ? "company"
      : "individual";
  const wantsInvoice = euAbroad ? customerType === "company" : postedInvoice;
  if (wantsInvoice && (!input.companyName || !input.vatNumber)) {
    return {
      error: euAbroad ? eu.vatRequired : "Για τιμολόγιο χρειάζονται επωνυμία και ΑΦΜ.",
      fieldErrors: {
        ...(input.companyName ? {} : { companyName: "Απαιτείται" }),
        ...(input.vatNumber ? {} : { vatNumber: "Απαιτείται" }),
      },
    };
  }
  /*
   * The format first, in the shop: a prefix that is not the selected
   * country's is a wrong format, and VIES is not asked (Review Focus 1).
   * Greece never comes here — its ΑΦΜ stays on the AADE path (Focus 5).
   */
  let euVat: string | null = null;
  if (euAbroad && wantsInvoice) {
    const format = normaliseEuVat(input.vatNumber, country);
    if (!format.ok) {
      const message = eu.vatFormat.replace("{example}", vatExample(vatPrefixFor(country)));
      return { error: message, fieldErrors: { vatNumber: message } };
    }
    euVat = format.vat;
  }

  if (input.shippingMethod !== "pickup") {
    if (!abroad) {
      const destination = checkDestination(address);
      if (!destination.ok) {
        const message = !international
          ? destinationMessage(destination, locale)
          : destination.reason === "foreign_address"
            ? intl.foreign
            : intl.unserviceable;
        return { error: message, fieldErrors: { [destination.field]: message } };
      }
    } else {
      const checked = validateCountryPostcode(country, address.shipPostcode);
      if (!checked.ok) {
        return { error: intl.postcode, fieldErrors: { shipPostcode: intl.postcode } };
      }
      // As the destination country writes it («1012 AB», «00-950»).
      address.shipPostcode = checked.postcode;
    }
  }

  const cartToken = await getCartToken();
  if (!cartToken) return { error: "Το καλάθι σας είναι άδειο." };

  /*
   * Who is placing this, if anyone.
   *
   * The column existed and was never written, so every order ever placed is
   * orphaned from its account and "my orders" had nothing to list. Guests still
   * get null and still get a token, which is what makes the confirmation page
   * work for someone who never registered.
   */
  const customer = await getCurrentUser();

  // Re-priced against the delivery postcode, not the indicative cart quote.
  const cart = await getCart(
    locale,
    address.shipPostcode,
    abroad ? { country, city: address.shipCity } : undefined,
  );
  if (!cart || cart.lines.length === 0) return { error: "Το καλάθι σας είναι άδειο." };

  /*
   * Back-order requests (docs/backorder-requests.md). Which lines can be paid
   * now and which become a request is decided HERE, from the stock `getCart`
   * has just read — never from what the form believed when it was rendered.
   * The customer's choice only matters for a mixed cart. Supplier lines are
   * ordinary paid lines (3–5 working days), never a request.
   */
  const plan = planCheckout(cart.lines, parseRequestMode(input.requestMode));
  if (!plan.ok) {
    return {
      error: "Επιλέξτε πώς θα προχωρήσει η παραγγελία: τα διαθέσιμα τώρα και τα υπόλοιπα ως αίτημα, ή όλα μαζί ως αίτημα.",
      fieldErrors: { requestMode: "Απαιτείται" },
    };
  }
  const payLines: CartLineView[] = plan.pay;
  const requestLines: CartLineView[] = plan.request;

  /*
   * The methods on offer for the destination. Flag off: the three it always
   * had, with the old fallback to the first. Flag on: a method that does not
   * fit the country (ACS to Italy, DHL to Athens) is refused, not guessed.
   */
  const shipping = euSales
    ? euSalesShippingMethods(chosenCountry).find((m) => m.id === input.shippingMethod)
    : international
      ? shippingMethodsFor(chosenCountry).find((m) => m.id === input.shippingMethod)
      : (SHIPPING_METHODS.find((m) => m.id === input.shippingMethod) ?? SHIPPING_METHODS[0]);
  if (!shipping) {
    return { error: intl.method, fieldErrors: { shippingMethod: intl.method } };
  }
  const payment =
    PAYMENT_METHODS.find((m) => m.id === input.paymentMethod) ?? PAYMENT_METHODS[0];

  /*
   * Kept as a guard even though nothing is `partnerOnly` any more: the field
   * exists, and the day something is added to it this is what stops a guest
   * reaching it by posting the id.
   */
  if (payment.partnerOnly) {
    return { error: "Ο τρόπος πληρωμής δεν είναι διαθέσιμος για τον λογαριασμό σας." };
  }


  // The lines being shipped now; for a request-only cart, the requested
  // ones — the address is checked either way.
  const parcelLines = payLines.length ? payLines : requestLines;
  const parcel = parcelLines.map((l) => ({
    quantity: l.quantity,
    weight: l.weight,
    width: l.width,
    length: l.length,
    height: l.height,
  }));
  /*
   * Abroad the price is asked for again HERE, from HDCtool — whatever the form
   * showed is not an input. Greece is the original call, unchanged.
   */
  const quote =
    shipping.expressMultiplier > 0 && !euAbroad
      ? abroad
        ? await quoteDestination({
            country,
            postcode: address.shipPostcode,
            city: address.shipCity,
            items: parcel,
            declaredValue: parcelLines.reduce((sum, l) => sum + l.lineGross, 0),
          })
        : await quoteLivePostage({ items: parcel, postcode: address.shipPostcode })
      : null;

  /*
   * ACS has no station for this postcode — a foreign postcode that happens to
   * look Greek (Verona's 37015 did). There is no price to charge and nowhere
   * to deliver, so no order. An ACS OUTAGE is different: it still prices from
   * the table and the order goes through.
   */
  if (isUnserviceable(quote)) {
    const message = international ? intl.unserviceable : shippingCopy(locale).unserviceable;
    return { error: message, fieldErrors: { shipPostcode: message } };
  }
  /* DHL said no to the place (422): on the Τ.Κ. field, and no table abroad. */
  if (isRefused(quote)) {
    const message = intl.refused[quote.error];
    return { error: message, fieldErrors: { shipPostcode: message } };
  }
  /* Nobody could price it abroad: blocked, «δοκιμάστε ξανά». */
  if (isQuoteUnavailable(quote)) {
    return { error: intl.unavailable };
  }

  /*
   * EU sales abroad: DHL, re-quoted HERE through HDCtool (B2 `quoteDhl`),
   * which also judges the postcode. No price → no order, with the spec's
   * sentence; a refusal about the place goes on the Τ.Κ. field.
   */
  let dhlQuote: Extract<DhlQuoteResult, { ok: true }> | null = null;
  if (euAbroad && shipping.expressMultiplier > 0) {
    const answer = await quoteDhl({
      country,
      postcode: address.shipPostcode,
      city: address.shipCity,
      weightKg: chargeableWeight(parcel).chargeableKg,
    });
    if (!answer.ok) {
      if (answer.reason === "unavailable") return { error: eu.noDhl };
      const message = intl.refused[answer.reason];
      return { error: message, fieldErrors: { shipPostcode: message } };
    }
    dhlQuote = answer;
  }

  /*
   * One query for the whole basket. `products.mtrl` is the ERP id; a line whose
   * product has since been removed simply keeps null, which is honest — better
   * an unmapped line the push can report than a wrong id it cannot.
   */
  const mtrlRows = await prisma.product.findMany({
    where: { id: { in: cart.lines.map((line) => line.productId) } },
    select: { id: true, mtrl: true, xmlCode: true },
  });
  const idsByProductId = new Map(
    mtrlRows.map((row) => [row.id, { mtrl: row.mtrl, xmlCode: row.xmlCode }]),
  );

  /* What a request shares with the order being placed: who, where, invoice. */
  const base: OrderBase = {
    email: input.email,
    phone: input.phone,
    firstName: input.firstName,
    lastName: input.lastName,
    ...address,
    ...(euSales
      ? { shipCountry: country, billCountry: country, customerType }
      : abroad
        ? { shipCountry: country }
        : {}),
    wantsInvoice,
    companyName: wantsInvoice ? input.companyName || null : null,
    vatNumber: wantsInvoice ? (euVat ?? (input.vatNumber || null)) : null,
    taxOffice: wantsInvoice && !euAbroad ? input.taxOffice || null : null,
    companyTrade: wantsInvoice && !euAbroad ? input.companyTrade || null : null,
    erpTrdr: wantsInvoice && !euAbroad && typeof input.erpTrdr === "number" ? input.erpTrdr : null,
    shippingMethod: shipping.id,
    notes: input.notes || null,
  };

  /*
   * Nothing to pay now: the whole cart is a request. No Viva order, no stock
   * hold — the customer gets a link and an answer within 24 hours.
   */
  if (payLines.length === 0) {
    const request = await createRequestOrder({
      orderNumber: await nextOrderNumber(),
      guestToken: randomBytes(24).toString("base64url"),
      customerId: customer?.id ?? null,
      locale,
      base,
      lines: requestLines,
      idsByProductId,
      parentOrderNumber: null,
    });
    await prisma.cartLine.deleteMany({ where: { cart: { token: cartToken } } });
    await maybeCreateAccount(input, request.orderNumber);
    await announceNewRequest(request.orderNumber);
    redirect(requestPath(locale, request.requestToken));
  }

  /*
   * Priced on what was SUBMITTED, not on what the cart row remembers.
   *
   * `getCart` reads the shipping and payment method from the Cart row, which is
   * written by the basket page. The checkout form has its own controls and did
   * not write back, so choosing "collect from the shop" here produced an order
   * stamped `pickup` and charged the courier rate that was still sitting in the
   * database. The customer was billed for delivery on an order they came to
   * fetch.
   *
   * The form is the last word and the ids above are already validated against
   * the offered list, so the totals are recomputed from them.
   */
  /*
   * VIES, asked again HERE for a foreign company — whatever the form showed
   * (Review Focus 2 and 3). HDCtool's 400/401 throw: that is ours to fix, and
   * the order goes on with VAT rather than failing. Exempt only with a valid
   * answer of today, for this country (`resolveVatMode`).
   */
  let vies: EuVatCheck | null = null;
  if (euAbroad && customerType === "company" && euVat) {
    try {
      vies = await checkEuVat(euVat, country);
    } catch (error) {
      console.error("[checkout] VIES check failed, charging VAT", error);
      vies = { status: "unavailable", name: null, consultationNumber: null, checkedAt: null, message: eu.unavailable };
    }
    if (vies.status === "invalid_format") {
      const message = eu.vatFormat.replace("{example}", vatExample(vatPrefixFor(country)));
      return { error: message, fieldErrors: { vatNumber: message } };
    }
  }
  const vatMode = euAbroad
    ? resolveVatMode({
        country,
        customerType,
        vies: vies ? { status: vies.status, checkedAt: vies.checkedAt, country } : null,
      })
    : "standard";
  const exempt = vatMode === "intra_eu_exempt";

  /*
   * The form showed the totals WITHOUT VAT (its untrusted hint), but VIES now
   * says otherwise — unavailable, invalid, or the earlier answer was from
   * another day. Charging more than was on screen without a word is not an
   * option: no order, the spec's «δοκιμάστε ξανά» sentence, and the fresh
   * answer goes into the buyer cookie so the page re-renders WITH VAT and the
   * customer continues knowingly (R11-I2).
   */
  if (euAbroad && input.vatModeHint === "intra_eu_exempt" && !exempt) {
    try {
      await writeEuBuyer({
        country,
        customerType,
        vat: euVat,
        vies: vies
          ? {
              status: vies.status,
              name: viesText(vies.name),
              consultationNumber: viesText(vies.consultationNumber),
              checkedAt: vies.checkedAt,
            }
          : null,
      });
    } catch (error) {
      console.error("[checkout] buyer cookie not refreshed", error);
    }
    return { error: eu.unavailable, fieldErrors: { vatNumber: eu.unavailable } };
  }

  const totals = await computeTotals(
    payLines,
    shipping.id,
    payment.id,
    address.shipPostcode,
    abroad ? { country, city: address.shipCity } : undefined,
    ...(euSales
      ? [
          {
            vatMode,
            shipping: dhlQuote ? { net: dhlQuote.netAmount, vatRate: vatRateForDestination(country) } : null,
          },
        ]
      : []),
  );
  /* The totals re-quote too; if that answer differs in kind, no order. */
  if (abroad && shipping.expressMultiplier > 0 && (totals.quoteUnavailable || totals.unserviceable)) {
    return { error: intl.unavailable };
  }

  const orderNumber = await nextOrderNumber();
  const guestToken = randomBytes(24).toString("base64url");

  const order = await prisma.order.create({
    data: {
      orderNumber,
      guestToken,
      customerId: customer?.id ?? null,
      status: "PENDING_PAYMENT",
      // Every method now settles before or after dispatch, never on it: cash on
      // delivery is not accepted, so ON_DELIVERY can no longer be reached.
      paymentStatus: "PENDING",

      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,

      // The shop's own address for a pickup order — see `deliveryAddress`.
      ...address,
      /*
       * EU sales: the country is always written, delivery and billing, with
       * who bought and how VAT was charged — and, for a foreign company, the
       * VIES answer this action got (the proof behind an exemption).
       */
      ...(euSales
        ? {
            shipCountry: country,
            billCountry: country,
            customerType,
            vatMode,
            ...(vies
              ? {
                  viesValid: vies.status === "valid",
                  viesName: viesText(vies.name),
                  viesAddress: null,
                  viesConsultationNumber: viesText(vies.consultationNumber),
                  viesCheckedAt: vies.checkedAt ? new Date(vies.checkedAt) : null,
                }
              : {}),
          }
        : abroad
          ? { shipCountry: country }
          : {}),

      wantsInvoice,
      companyName: wantsInvoice ? input.companyName || null : null,
      vatNumber: wantsInvoice ? (euVat ?? (input.vatNumber || null)) : null,
      taxOffice: wantsInvoice && !euAbroad ? input.taxOffice || null : null,
      companyTrade: wantsInvoice && !euAbroad ? input.companyTrade || null : null,
      erpTrdr: wantsInvoice && !euAbroad && typeof input.erpTrdr === "number" ? input.erpTrdr : null,

      shippingMethod: shipping.id,
      paymentMethod: payment.id,
      notes: input.notes || null,
      /* One line from the supplier sends the whole order in 3–5 working days;
         frozen here so the confirmation and the email keep saying so. */
      supplierOrder: orderAvailability(payLines.map((l) => l.availability)) === "supplier",

      subtotalNet: totals.subtotalNet,
      subtotalGross: totals.subtotalGross,
      shippingNet: totals.shippingNet,
      shippingGross: totals.shippingGross,
      paymentFeeNet: totals.paymentFeeNet,
      paymentFeeGross: totals.paymentFeeGross,
      vatAmount: totals.vatAmount,
      totalGross: totals.totalGross,
      savingsGross: totals.savingsGross,
      /* The customer's language rides on the frozen checkout snapshot, so every
         later email (payment, shipping, status) is written in it. A column
         would need a migration on the live database (lib/mail/hdc/order-view). */
      shippingQuote: dhlQuote
        ? JSON.parse(JSON.stringify(dhlShippingQuote(dhlQuote, country, address.shipPostcode, locale, exempt)))
        : quote
        ? JSON.parse(JSON.stringify({ ...quote, locale }))
        : locale === "el"
          ? undefined
          : { locale },

      lines: {
        create: payLines.map((line) => ({
          productId: line.productId,
          /*
           * The ERP's own product id, resolved here and frozen with the line.
           *
           * The column existed and nothing ever filled it: 17 order lines, zero
           * with an MTRL. HDCtool's intake reported every one of them as
           * `unmappedLines`, so a document issued from an order would have
           * carried no items — the sale, with nothing sold.
           *
           * Resolved at placement rather than at push, and stored rather than
           * looked up again later, for the same reason as every other value on
           * this row: a product can be relisted under a different MTRL, and an
           * order is a record of what was bought, not of what the catalogue
           * says today.
           */
          // Αρνητικό mtrl = προϊόν μόνο-XML· ταξιδεύει με τον κωδικό του XML.
          ...orderLineIds(idsByProductId.get(line.productId)),
          sku: line.sku,
          name: line.name,
          brand: line.brandName,
          imageUrl: line.image,
          quantity: line.quantity,
          /* Κανονική τιμή και ποσοστό χωριστά — όπως τα θέλει η γραμμή του
             παραστατικού, και όπως πρέπει να διαβάζεται η παραγγελία σε έξι
             μήνες, όταν η καμπάνια θα έχει λήξει. */
          unitNet: line.unitNet,
          discountPercent: line.discountPercent,
          offerTitle: line.offerTitle,
          /* Exempt (intra-EU, valid VIES): the line is frozen as charged — no
             VAT, gross = net — so the row never contradicts its totals. */
          unitGross: (exempt ? line.lineNet : line.lineGross) / line.quantity,
          vatRate: exempt ? 0 : line.vatRate,
          lineNet: line.lineNet,
          lineGross: exempt ? line.lineNet : line.lineGross,
          weightKg: line.weight,
        })),
      },
      history: {
        create: { status: "PENDING_PAYMENT", actor: "customer", note: "Order placed" },
      },
    },
    select: { id: true, orderNumber: true, guestToken: true, totalGross: true },
  });

  // The cart is emptied only after the order row exists — a failure above must
  // leave the customer with their basket intact.
  await prisma.cartLine.deleteMany({ where: { cart: { token: cartToken } } });

  /*
   * Split cart: the lines that were not in stock become a request of their
   * own, pointing at this order. Written after the paid order exists (so it
   * has a number to point at) and before the customer leaves for Viva.
   */
  if (requestLines.length > 0) {
    try {
      const request = await createRequestOrder({
        orderNumber: await nextOrderNumber(),
        guestToken: randomBytes(24).toString("base64url"),
        customerId: customer?.id ?? null,
        locale,
        base,
        lines: requestLines,
        idsByProductId,
        parentOrderNumber: order.orderNumber,
      });
      await announceNewRequest(request.orderNumber);
    } catch (error) {
      // The paid half stands on its own; the customer is told on the page.
      console.error(`[checkout] ${order.orderNumber}: back-order request not created`, error);
    }
  }

  await maybeCreateAccount(input, order.orderNumber);

  /*
   * Bank transfer: accepted now, reconciled later, and it needs a reference.
   *
   * The order used to be confirmed with nothing tying a future deposit to it,
   * so matching a bank statement line to an order was a manual search by name
   * and amount. Asking Viva for a payment order gives the customer a code to
   * quote on the transfer, and when the money lands Viva notifies
   * `/api/webhooks/viva` with our order number in `merchantTrns` — the same
   * path a card payment already takes. Reconciliation stops being clerical.
   *
   * Deliberately NOT fatal. The order is placed and the goods are reserved; a
   * Viva outage must not undo that. Without a code the confirmation page simply
   * asks the customer to quote the order number, which is what happened before.
   *
   * The window is long because a transfer is not a card: SEPA credit between
   * Greek banks routinely takes a working day, and a code that expires in half
   * an hour would expire before anyone reached a banking app.
   */
  if (payment.id === "bank") {
    /*
     * Stamp the hold BEFORE anything that can fail.
     *
     * Viva may be unreachable and the email may not send; neither changes the
     * fact that this order is holding stock from now. Writing the deadline
     * first means the shop always knows what it committed to, even for an order
     * whose payment link never got created.
     */
    const reservedUntil = holdExpiry();
    await prisma.order.update({
      where: { id: order.id },
      data: { reservedUntil },
    });

    if (isVivaConfigured()) {
      try {
        const paymentOrder = await createPaymentOrder({
          amountGross: Number(order.totalGross),
          orderNumber: order.orderNumber,
          description: `Kolleris ${order.orderNumber}`,
          locale,
          customer: {
            email: input.email,
            fullName: `${input.firstName} ${input.lastName}`,
            phone: input.phone,
          },
          expiryMinutes: BANK_TRANSFER_WINDOW_MINUTES,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { vivaOrderCode: paymentOrder.orderCode },
        });
      } catch (error) {
        console.error(`[checkout] no Viva code for ${order.orderNumber}`, error);
      }
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    });

    /*
     * The email the payment step promises: "Θα λάβετε τα στοιχεία κατάθεσης".
     *
     * For a bank transfer this is not a courtesy — it carries the IBAN and the
     * reference to write on the deposit, without which the money arrives and
     * nobody can tell whose it is. Sent here rather than from the webhook,
     * because the whole point is that it goes out BEFORE the customer pays.
     *
     * Never fatal, and never awaited into the redirect's way for longer than it
     * takes: the order exists and is confirmed. A mail failure is logged and
     * the confirmation page still shows the details on screen.
     */
    const mail = await sendOrderEmail(order.orderNumber);
    if (!mail.ok) {
      console.error(`[checkout] ${order.orderNumber} email not sent: ${mail.error}`);
    }

    /* Και στο κατάστημα, στην ίδια στιγμή. Ξεχωριστή αποστολή και όχι BCC: το
       προσωπικό χρειάζεται άλλα στοιχεία από τον πελάτη — τηλέφωνο, ΑΦΜ, αν
       εισπράχθηκαν τα χρήματα, σύνδεσμο στη διαχείριση. */
    const internal = await sendInternalOrderEmail(order.orderNumber);
    if (!internal.ok) {
      console.error(`[checkout] ${order.orderNumber} internal email not sent: ${internal.error}`);
    }

    redirect(`/checkout/epibebaiosi/${order.orderNumber}?t=${order.guestToken}`);
  }

  // Anything else that settles off-site needs no redirect and no code.
  if (payment.id !== "card" && payment.id !== "iris") {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
    });
    redirect(`/checkout/epibebaiosi/${order.orderNumber}?t=${order.guestToken}`);
  }

  if (!isVivaConfigured()) {
    // The order exists and is recoverable; say so instead of losing it.
    return {
      error:
        "Η πληρωμή με κάρτα δεν είναι διαθέσιμη αυτή τη στιγμή. Η παραγγελία " +
        `${order.orderNumber} καταχωρήθηκε — θα επικοινωνήσουμε μαζί σας.`,
    };
  }

  let checkoutUrl: string;
  try {
    const paymentOrder = await createPaymentOrder({
      amountGross: Number(order.totalGross),
      orderNumber: order.orderNumber,
      description: `Kolleris ${order.orderNumber}`,
      locale,
      customer: {
        email: input.email,
        fullName: `${input.firstName} ${input.lastName}`,
        phone: input.phone,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { vivaOrderCode: paymentOrder.orderCode },
    });
    checkoutUrl = paymentOrder.checkoutUrl;
  } catch (error) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "FAILED",
        history: {
          create: {
            status: "FAILED",
            actor: "system",
            note: error instanceof Error ? error.message : "Viva order failed",
          },
        },
      },
    });
    return {
      error: `Η σύνδεση με την τράπεζα απέτυχε. Η παραγγελία ${order.orderNumber} καταχωρήθηκε — καλέστε μας στο ${PRIMARY_PHONE.display}.`,
    };
  }

  // Outside the try: `redirect` throws by design, and catching it here would
  // turn a successful checkout into an error message.
  redirect(checkoutUrl);
}

/** VIES writes «---» for what it will not disclose: that is not a value. */
function viesText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text && text !== "---" ? text : null;
}

/**
 * The DHL quote as `orders.shippingQuote` keeps it — the shape the intake
 * `shipping` block (`lib/shipping/intake`) and the order screens read:
 * carrier, productCode, netAmount, vatRate, quotedAt.
 */
function dhlShippingQuote(
  quote: Extract<DhlQuoteResult, { ok: true }>,
  country: string,
  postcode: string,
  locale: string,
  /** Intra-EU exempt: postage carried no VAT, and the stored quote says so. */
  exempt: boolean,
) {
  return {
    source: "dhl",
    carrier: "DHL",
    productCode: quote.productCode,
    productName: quote.productName,
    netAmount: quote.netAmount,
    totalNet: quote.netAmount,
    vatRate: exempt ? 0 : vatRateForDestination(country),
    grossAmount: exempt ? quote.netAmount : quote.grossAmount,
    currency: "EUR",
    estimatedDeliveryDate: quote.estimatedDeliveryDate ?? null,
    quotedAt: quote.quotedAt,
    country,
    postcode,
    locale,
  };
}

/*
 * Shared by the ordinary order and the request-only checkout: both have a
 * customer who may have typed a password.
 */
async function maybeCreateAccount(
  input: { password?: string; email: string; firstName: string; lastName: string; phone: string },
  orderNumber: string,
): Promise<void> {
  /*
   * An account, when the customer asked for one by typing a password.
   *
   * Created outright rather than by emailing a link: the person is here, they
   * chose the password themselves, and everything a registration needs — name,
   * phone, email — they have just typed. Making them confirm by email what
   * they did thirty seconds ago on the same screen is ceremony.
   *
   * The order is attached, and so is every earlier guest order sharing the
   * address, so their history is complete from the first visit rather than
   * starting at this purchase.
   *
   * Deliberately NOT fatal and deliberately last. The order exists and is paid
   * for; an account is a convenience layered on top, and a duplicate email or a
   * hashing hiccup must never cost somebody the thing they actually came for.
   */
  if (input.password) {
    try {
      const email = input.email.trim().toLowerCase();
      const taken = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
      if (!taken) {
        const created = await prisma.customer.create({
          data: {
            email,
            passwordHash: await hashPassword(input.password),
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            /*
             * Retail, always — even when this order carried a ΑΦΜ.
             *
             * A company account grants partner pricing and credit and exists
             * only once somebody has approved it. Nobody gets one by ticking
             * "invoice" at checkout; that route is /b2b, and it goes through
             * a person.
             */
            accountType: "individual",
            status: "active",
          },
          select: { id: true },
        });

        await prisma.order.updateMany({
          where: { email: { equals: email, mode: "insensitive" }, customerId: null },
          data: { customerId: created.id },
        });
      }
    } catch (error) {
      console.error(`[checkout] ${orderNumber}: account not created`, error);
    }
  }
}
