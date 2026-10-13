import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { RequestActions } from "@/components/requests/RequestActions";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/format";
import { displayName } from "@/lib/milwaukee/display";
import { prisma } from "@/lib/prisma";
import {
  compareOffer,
  isWellFormedToken,
  offerHasExpired,
  offerShippingNet,
  priceLines,
  readSnapshot,
  readStoredOffer,
  type ComparisonRow,
} from "@/lib/requests/model";
import { quoteOfferShipping } from "@/lib/requests/shipping";

export const dynamic = "force-dynamic";

/**
 * A back-order request, as its customer sees it (docs/backorder-requests.md §5),
 * in the HDC confirmation layout (checkout.css `.hdc-ok`).
 *
 * Opened by the link in the emails and by nothing else: the token in the path
 * is the whole authorisation, 43 characters of crypto randomness, so the page
 * is never indexed and never sends the token on as a referrer.
 *
 * Read-only apart from the two buttons, which post to server actions that
 * check the token, the state, the expiry and the offer version again.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "aitima.Hdc" });
  return {
    title: t("titlos"),
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

type PageProps = { params: Promise<{ locale: Locale; token: string }> };

type View = "REQUESTED" | "OFFERED" | "ACCEPTED" | "PAID" | "DECLINED" | "EXPIRED" | "REJECTED";

function stamp(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "el" ? "el-GR" : locale === "it" ? "it-IT" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Athens",
  }).format(date);
}

export default async function RequestPage({ params }: PageProps) {
  const t = await getTranslations("aitima.Hdc");
  const { locale, token } = await params;
  setRequestLocale(locale);

  if (!isWellFormedToken(token)) notFound();

  const [order, miniCart, menuTree, brands, stats, rootCategories] = await Promise.all([
    prisma.order.findUnique({ where: { requestToken: token }, include: { lines: true } }),
    getMiniCart(locale),
    getMenuTree(locale),
    getTopBrands(locale),
    getCatalogueStats(),
    getRootCategories(locale),
  ]);
  if (!order || !order.requestStatus) notFound();

  const requested = readSnapshot(order.requestLines)?.lines ?? [];
  const offer = readStoredOffer(order.offerJson);
  const view: View =
    order.paymentStatus === "PAID"
      ? "PAID"
      : offerHasExpired(order)
        ? "EXPIRED"
        : (order.requestStatus as View);

  const money = (n: number) => formatMoney(n, locale);
  const priced = (unitNet: number, vatRate: number, qty: number) => priceLines([{ unitNet, vatRate, qty }], 0).lines[0];

  // The offer, priced exactly as acceptance will price it.
  let rows: ComparisonRow[] = [];
  let offerTotals: ReturnType<typeof priceLines> | null = null;
  let shippingKnown = true;
  if (view === "OFFERED" && offer?.decision === "offer") {
    rows = compareOffer(requested, offer.lines);
    let shippingNet = offerShippingNet(offer);
    if (shippingNet == null) {
      const quoted = await quoteOfferShipping(order, offer.lines).catch(() => null);
      if (quoted?.ok) shippingNet = quoted.shippingNet;
      else shippingKnown = false;
    }
    offerTotals = priceLines(offer.lines, shippingNet ?? 0, order.shipCountry);
  }
  const requestedTotals = priceLines(requested, 0);

  const confirmationHref = `${locale === "el" ? "" : `/${locale}`}/checkout/epibebaiosi/${encodeURIComponent(order.orderNumber)}?t=${encodeURIComponent(order.guestToken)}`;

  const tag = (row: ComparisonRow) =>
    row.kind === "same"
      ? ""
      : row.kind === "modified"
        ? t("tag_modified")
        : row.kind === "alternative"
          ? t("tag_alternative")
          : row.kind === "added"
            ? t("tag_added")
            : t("tag_removed");

  return (
    <>
      <SiteChrome locale={locale} cart={miniCart} categories={menuTree} brands={brands} stats={stats} />

      <main id="main" className="hdc-co-page">
        <div className="hdc-wrap hdc-ok hdc-req">
          <div className="hdc-ok-main">
            <div className="okhead">
              <h1 className="hdc-disp">{t(`headline_${view}`)}</h1>
              <p>{t(`intro_${view}`)}</p>
              {order.parentOrderNumber && (
                <p className="sub">{t("parent_note", { number: order.parentOrderNumber })}</p>
              )}
              <span className="num">{order.orderNumber}</span>
            </div>

            {view === "REJECTED" && offer?.decision === "reject" && offer.reason && (
              <p className="hdc-req-note bad">
                <b>{t("reason_title")}</b>
                {offer.reason}
              </p>
            )}

            {view === "OFFERED" && offer?.decision === "offer" && (
              <>
                <div className="hdc-det">
                  <div>
                    <h2>{t("lead_time")}</h2>
                    <p>{offer.leadTimeText ?? "—"}</p>
                  </div>
                  <div>
                    <h2>{t("validity")}</h2>
                    <p>{order.offerExpiresAt ? stamp(order.offerExpiresAt, locale) : "—"}</p>
                  </div>
                  <div>
                    <h2>{t("metaforika")}</h2>
                    <p>
                      {!shippingKnown || !offerTotals
                        ? "—"
                        : offerTotals.shippingGross === 0
                          ? t("dorean")
                          : money(offerTotals.shippingGross)}
                    </p>
                  </div>
                </div>
                {offer.note && (
                  <p className="hdc-req-note">
                    <b>{t("note_title")}</b>
                    {offer.note}
                  </p>
                )}

                <div className="hdc-req-rows">
                  <h2>{t("offer_title")}</h2>
                  <ul>
                    {rows.map((row, index) => {
                      const removed = row.kind === "removed";
                      const line = removed ? row.requested : row.offered;
                      const qty = removed ? row.requested.qty : row.offered.qty;
                      const p = priced(line.unitNet, line.vatRate, qty);
                      return (
                        <li
                          key={`${row.kind}-${index}`}
                          data-removed={removed || undefined}
                          data-changed={(!removed && row.kind !== "same") || undefined}
                        >
                          <span>
                            {tag(row) && <span className="tag">{tag(row)}</span>}
                            <span className="n">{displayName(line.name, line.sku)}</span>
                            {row.kind === "alternative" && row.requested && (
                              <span className="w">{t("instead_of", { name: displayName(row.requested.name, row.requested.sku) })}</span>
                            )}
                            <span className="c">
                              {line.sku} ·{" "}
                              {row.kind === "modified" && row.qtyChanged ? <mark>{qty} {t("tem")}</mark> : <>{qty} {t("tem")}</>} ×{" "}
                              {row.kind === "modified" && row.priceChanged ? <mark>{money(p.unitGross)}</mark> : money(p.unitGross)}
                              {!removed && row.offered.leadTimeText ? ` · ${row.offered.leadTimeText}` : ""}
                            </span>
                            {row.kind === "modified" && (row.qtyChanged || row.priceChanged) && (
                              <span className="w">
                                {[
                                  row.qtyChanged ? t("requested_qty", { qty: row.requested.qty }) : null,
                                  row.priceChanged
                                    ? t("requested_price", { price: money(priced(row.requested.unitNet, row.requested.vatRate, 1).unitGross) })
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </span>
                          <span className="p">{money(p.lineGross)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}

            {(view === "EXPIRED" || view === "DECLINED" || view === "REJECTED") && (
              <div className="hdc-ok-acts">
                <Link href="/epikoinonia" className="hdc-btn hdc-btn-line hdc-btn-lg">
                  {t("contact")} →
                </Link>
              </div>
            )}
            {view === "PAID" && (
              <div className="hdc-ok-acts">
                <a href={confirmationHref} className="hdc-btn hdc-btn-red hdc-btn-lg">
                  {t("view_order")} →
                </a>
              </div>
            )}
            <p className="hdc-req-note">{t("private_link")}</p>
          </div>

          <aside className="hdc-sum hdc-ok-sum">
            <h2 className="hdc-disp">
              {view === "OFFERED" || view === "ACCEPTED" || view === "PAID" ? t("offer_title") : t("requested_title")}
            </h2>
            <div className="in hdc-sum-body">
              <ul className="hdc-mini">
                {(view === "ACCEPTED" || view === "PAID"
                  ? order.lines.map((l) => ({ id: l.id, name: l.name, sku: l.sku, qty: l.quantity, image: l.imageUrl, gross: Number(l.lineGross) }))
                  : requested.map((l) => ({ id: l.lineId, name: l.name, sku: l.sku, qty: l.qty, image: l.imageUrl, gross: priced(l.unitNet, l.vatRate, l.qty).lineGross }))
                ).map((line) => (
                  <li key={line.id}>
                    <span className="im">
                      {line.image && <Image src={line.image} alt="" width={64} height={64} sizes="64px" />}
                      <em>{line.qty}</em>
                    </span>
                    <b>{displayName(line.name, line.sku)}</b>
                    <span className="p">{money(line.gross)}</span>
                  </li>
                ))}
              </ul>

              {offerTotals ? (
                <>
                  <dl>
                    <div>
                      <dt>{t("kathari_axia")}</dt>
                      <dd>{money(offerTotals.subtotalNet)}</dd>
                    </div>
                    <div>
                      <dt>{t("metaforika")}</dt>
                      <dd className={shippingKnown && offerTotals.shippingGross === 0 ? "fr" : undefined}>
                        {!shippingKnown ? "—" : offerTotals.shippingGross === 0 ? t("dorean") : money(offerTotals.shippingGross)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("fpa")}</dt>
                      <dd>{money(offerTotals.vatAmount)}</dd>
                    </div>
                  </dl>
                  <div className="tot">
                    <b>{t("synolo")}</b>
                    <span>{money(offerTotals.totalGross)}</span>
                  </div>
                </>
              ) : view === "ACCEPTED" || view === "PAID" ? (
                <div className="tot">
                  <b>{t("synolo")}</b>
                  <span>{money(Number(order.totalGross))}</span>
                </div>
              ) : (
                <>
                  <dl>
                    <div>
                      <dt>{t("metaforika")}</dt>
                      <dd>{t("shipping_with_offer")}</dd>
                    </div>
                  </dl>
                  <div className="tot">
                    <b>{t("endeiktiki_axia")}</b>
                    <span>{money(requestedTotals.subtotalGross)}</span>
                  </div>
                </>
              )}

              {view === "OFFERED" && (
                <RequestActions
                  token={token}
                  offerVersion={order.offerVersion}
                  expiresAt={order.offerExpiresAt?.toISOString() ?? null}
                  mode="offer"
                />
              )}
              {view === "ACCEPTED" && (
                <RequestActions token={token} offerVersion={order.offerVersion} expiresAt={null} mode="pay" />
              )}
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}
