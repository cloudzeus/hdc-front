# Back-order requests («Κατόπιν παραγγελίας») — shared contract

Applies to BOTH eshops (Kolleris `KOL-…`, Milwaukee hdc-front `HDC-…`) and HDCtool.
HDCtool owns the staff decision (the offer). The eshop owns the customer, emails, and Viva payment.
Reuse existing transports — do NOT invent new auth:
- eshop → HDCtool: the existing authenticated intake `POST /api/public/orders` (same client the eshop already uses, `hdctoolRequest`), re-posted on every state change (it is idempotent by orderNumber).
- HDCtool → eshop: the existing signed webhook family `/api/webhooks/hdctool/<event>` (HMAC over raw body, `verifySignature`, same secret, same target resolution as `eshop-order-webhook-target.ts` / `eshop-order-status-notify.ts`).

## 1. When an order is a request
A cart line is "on request" when the product has no stock OR quantity > available stock.
- All lines on request → the whole order is a REQUEST (no payment, no stock hold).
- Mixed cart → the customer chooses at checkout:
  - `split`: in-stock lines become a normal paid order now; on-request lines become a separate REQUEST order with `parentOrderNumber` = the paid order.
  - `together`: the whole cart becomes one REQUEST.
- Requests skip Viva entirely at submission. Customer gets «Λάβαμε το αίτημά σας — θα επιβεβαιωθεί εντός 24 ωρών» with a link `/{locale}/aitima/{token}` (token = random 32+ chars, unguessable, stored hashed or as-is with unique index).

## 2. Request lifecycle (same names in all three systems)
`REQUESTED` → (staff) `OFFERED` | `REJECTED`
`OFFERED` → (customer) `ACCEPTED` (Viva payment created, awaiting payment) | `DECLINED` | (timer) `EXPIRED`
`ACCEPTED` → payment confirmed → the order becomes a NORMAL paid order and continues the standard flow (receipt, HDCtool intake as paid, SoftOne, ACS). `requestStatus` stays `ACCEPTED` and paymentStatus becomes PAID.
A REQUESTED/OFFERED/REJECTED/DECLINED/EXPIRED order must NEVER be sent to SoftOne and must not count as a sale.

## 3. eshop → HDCtool (intake body additions, all optional for backward compat)
```
request: {
  status: "REQUESTED"|"OFFERED"|"ACCEPTED"|"DECLINED"|"EXPIRED"|"REJECTED",
  requestedAt: ISO, parentOrderNumber?: string,
  lines: [{ lineId, mtrl, sku, name, qty, unitNet, vatRate, stockAtRequest: number|null }],
  offerVersion?: number,          // the offer the customer acted on
  customerNote?: string
}
```
HDCtool stores it on its EshopOrder (additive columns or a related table) and shows it in the requests screen. HDCtool must not push a request to SoftOne until `paymentStatus === PAID` (check the existing auto-push / document-issuing paths and gate them).

## 4. HDCtool → eshop: `POST /api/webhooks/hdctool/order-offer` (signed)
```
{
  orderNumber: "KOL-…",
  offerVersion: 1,                // increments on every re-send; eshop keeps only the latest
  decision: "offer" | "reject",
  // decision = offer:
  lines: [{
    kind: "original" | "modified" | "alternative",
    replacesLineId?: string,       // for modified/alternative: which requested line it replaces
    mtrl: number, sku: string, name: string,
    qty: number, unitNet: number, vatRate: number,   // staff-set price, net EUR
    leadTimeText?: string          // e.g. "5–7 εργάσιμες"
  }],
  removedLineIds: string[],        // requested lines dropped without replacement
  leadTimeText?: string,           // order-level
  shippingNet?: number | null,     // null/absent → eshop computes shipping with its normal ACS quote for the offered lines
  note?: string,                   // shown to the customer
  expiresAt: ISO,                  // default now + 3 days
  // decision = reject:
  reason?: string
}
```
Eshop: verify signature, reject stale `offerVersion`, store the offer, set `requestStatus`, email the customer (offer email with the request link / rejection email), respond `{ ok: true }`. Idempotent per (orderNumber, offerVersion).

## 5. Customer page `/{locale}/aitima/{token}` (eshop)
Shows status. When OFFERED: requested vs offered lines (changes highlighted: modified qty/price, alternatives with "αντί για …", removed), lead time, note, totals incl. shipping, expiry countdown, buttons «Αποδοχή & πληρωμή» / «Απόρριψη». Accept → order lines replaced by the offer (keep the original request lines for history), totals recomputed server-side from the STORED offer (never from the browser), Viva payment order created with the existing createPaymentOrder → redirect to Viva Smart Checkout (card / IRIS). Viva webhook/recheck (existing) completes it like any order. Decline → DECLINED. After `expiresAt` → EXPIRED (page shows "η πρόταση έληξε — επικοινωνήστε μαζί μας").

## 6. Timers (eshop, in-process like the payment sweep, with the same DB lock pattern)
- Offer not paid after 24h → one reminder email.
- `expiresAt` passed → EXPIRED, notify HDCtool via intake re-post.
HDCtool timer: requests still REQUESTED after 20h → one alert email to the shop (existing Mailgun helper, internal recipients already used for internal order emails) and red SLA badge.

## 7. Emails (Greek, existing templates/style; EN/IT where the shop has locales)
Request received · Offer ready (with link) · Offer reminder · Request rejected (with reason) · Offer expired. Secret-bearing links: Mailgun `tracking: false` (HDCtool helper has it; eshops: check their mailer and disable click tracking for these).

## HDCtool interface notes

Clarifications of §3–§4 as HDCtool implements them (both eshops follow them):

- **Offer lines.** `original` lines come WITHOUT `replacesLineId` — the eshop matches them to the requested line by `mtrl`. `modified` is sent only when qty or price changed (a lead time alone is not a change). A product staff add («Προσθήκη προϊόντος») is `kind: "alternative"` WITHOUT `replacesLineId`: an additional line, shown «Προσθήκη», never «αντί για …». `alternative` WITH `replacesLineId` is a substitute.
- **`shippingNet`** is always present; `null` = the eshop computes shipping (its normal ACS quote for the offered lines and the order's postcode).
- **Reject** body is exactly `{ orderNumber, offerVersion, decision: "reject", reason }`, `reason` always present. A reject also increments `offerVersion`, so a reject with a higher version than the last offer is applied; an offer after a reject never comes from HDCtool.
- **Delivery / retries.** HDCtool marks OFFERED/REJECTED only on HTTP 2xx with JSON `{ ok: true }`. On anything else it keeps the offer as undelivered and retries the SAME `offerVersion` — so a repeat of the same version must answer `{ ok: true }` without emailing the customer again (the eshop answers `{ ok: true, duplicate: true }`; an older version `{ ok: true, ignored: "stale_offer_version" }`).
- **Signature**: `x-hdc-signature` + `x-hdc-timestamp`, the same as `order-status`. Path `<webhook base>/order-offer` — Kolleris: the base used for `order-status` / `order-shipped`; Milwaukee: the base HDCtool calls for `HDC-` orders.
- **Intake** (`POST /api/public/orders`): `request: { status, requestedAt, parentOrderNumber?, lines: [{ lineId, mtrl, sku, name, qty, unitNet, vatRate, stockAtRequest }], offerVersion?, customerNote? }`. Money may be numbers or strings. A malformed block → HTTP 400 with nothing written (the eshop logs it and records it in `orders.erpError`). The response carries `request: { status }` as stored. Status never moves backwards (REQUESTED < OFFERED < terminal); among terminal statuses the eshop wins.
- **After acceptance + payment** the ordinary re-post with `paymentStatus: "PAID"` releases the order to SoftOne; it keeps the `request` block with `status: "ACCEPTED"` and the `offerVersion` the customer accepted (the eshop refuses newer offers once ACCEPTED, so `offerVersion` stays the accepted one).
- HDCtool accepts staff decisions only while the request is REQUESTED or OFFERED.

---

## Appendix — how the Milwaukee (HDC) eshop implements it

Not part of the contract; where to look in this repo.

- **Which lines are «on request»**: no stock of ours AND not available from the supplier XML, or more than our stock of a product the supplier does not have (`isOnRequest` in `src/lib/requests/model.ts`). Lines the supplier XML covers stay ordinary paid lines with the existing «3–5 εργάσιμες» promise — they were never requests in this shop. (Previously, lines with neither our stock nor the supplier's were sold as ordinary orders with «Παράδοση 1–3 εργάσιμες»; those now become requests.)
- **Data**: additive columns on `orders` (`requestStatus`, `requestToken` unique, `requestedAt`, `parentOrderNumber`, `requestLines` = `{ v, locale, lines[] }` snapshot, `offerVersion`, `offerJson`, `offerExpiresAt`, `offerRemindedAt`, `requestDecisionAt`) — migration `20261013120000_order_backorder_requests` (apply with `prisma migrate deploy`). A request is an ordinary `orders` row with `paymentMethod = card`, `shippingNet = 0` until the offer, no Viva order / stock hold; non-Greek requests keep `shippingQuote = { locale }` like checkout so later order emails stay in the customer's language. XML-only products (negative MTRL) travel with `xmlCode` and `mtrl: null`, as on ordinary lines.
- **Checkout**: `src/lib/checkout/actions.ts` → `src/lib/requests/create.ts`; the HDC form gets a «Προϊόντα κατόπιν παραγγελίας» step for a mixed cart and drops the payment step when nothing is paid now.
- **Split clarity** (what the customer sees for a mixed cart): `src/lib/requests/breakdown.ts` (pure) + `checkout-breakdown.ts` price both choices on the server for the remembered Τ.Κ. — «split» = `computeTotals` on the in-stock lines only (their own postage and free-delivery threshold, the same call `placeOrder` charges with; the courier tiles are priced for those lines too), the request part indicative; «together» = the whole cart, nothing paid now, courier tiles «Στην πρόταση». The step tiles, the grouped summary (`components/checkout/SplitCheckout.tsx`: «Αποστέλλονται τώρα» / «Κατόπιν παραγγελίας», «Πληρωτέο τώρα» apart from «Σε αίτημα (ενδεικτικά)»), the phone bar and the pay button («Πληρωμή X €») read that one breakdown. The confirmation shows both halves with numbers; the receipt (`order-confirmation` / `payment-success`, partial `split-section`, `lib/mail/hdc/split.ts`) lists the rest of the basket with the request link (tracking off) in the customer's language; the request emails name the paid order with its amount and postage and call the request the second shipment; internal emails name both numbers; the account order page links the other half.
- **State changes**: `src/lib/requests/service.ts`. **HDCtool**: `syncRequestToHdctool` + the `request` block in `buildIntakeBody` (`src/lib/orders/send-to-erp.ts`); `sendOrderToErp` refuses any request not ACCEPTED **and** PAID, and the Viva webhook refuses to book a payment on a request that was not accepted.
- **Webhook**: `POST /api/webhooks/hdctool/order-offer`, same `HDCTOOL_WEBHOOK_SECRET` and headers as `order-status`. Answers as in the Kolleris shop: `200 {ok:true,…}` (duplicate / stale versions too), `400`, `401`, `404`, `409`, `422`.
- **Customer page**: `/{locale}/aitima/{token}` (`src/app/[locale]/(site)/aitima/[token]/page.tsx`) in the confirmation layout; noindex, `referrer: no-referrer`.
- **Emails**: `src/lib/mail/request-emails.ts`, templates `src/emails/hdc/templates/order-request.hbs` (el/en/it, variants received / offer / reminder / rejected / expired) and `internal-request.hbs` (Greek, to `MAIL_ORDER_NOTIFY`); both in the admin «Πρότυπα email» list. Mailgun tracking off on every customer email that carries the token.
- **Timer**: the «requests» job of the in-process cron (`src/lib/cron/schedule.ts`, every 15 min, `claimSlot` per interval; `CRON_DISABLED=requests` turns it off).
- **Admin**: request chip/status on `/admin/orders` and the order page (read-only), «Αιτήματα» filter; open requests are not counted as sales on the dashboard.

## Πληρωμή με κατάθεση και ιστορικό προτάσεων (2026-10-31)

- Η σελίδα `/aitima/{token}` δίνει δύο δρόμους μετά την αποδοχή: κάρτα/IRIS (Viva) ή **τραπεζική κατάθεση**. Η κατάθεση παίρνει κωδικό αιτιολογίας Viva που ισχύει `BANK_PAYMENT_CODE_DAYS` (7 ημέρες), email με τα στοιχεία κατάθεσης και τη σελίδα επιβεβαίωσης — ίδια με την κατάθεση του checkout.
- Κατάθεση που η Viva δεν ταυτίζει (λάθος αιτιολογία, ληγμένος κωδικός) καταχωρείται από τη διαχείριση: σελίδα παραγγελίας → «Καταχώρηση πληρωμής κατάθεσης». Ακολουθούν τα ίδια βήματα με μια πληρωμή Viva (`afterPaymentCaptured`): απόδειξη, HDCtool, παραστατικό SoftOne.
- Κάθε νέα πρόταση του HDCtool κρατά τις προηγούμενες στο `offerJson.history` (παλαιότερη πρώτη). Η σελίδα παραγγελίας στη διαχείριση τις δείχνει όλες στο «Ιστορικό προτάσεων».
