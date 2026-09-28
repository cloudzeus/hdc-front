import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { ReorderButton } from "@/components/account/ReorderButton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { OrderRowData } from "@/lib/account/dashboard";
import type { PlatformTools } from "@/lib/account/my-tools";
import { statusChip } from "@/lib/account/order-view";
import type { TrackStage } from "@/lib/account/track-stages";
import { formatMoney } from "@/lib/format";

/**
 * The pieces of account.html, screens 2 and 3, that more than one page shows:
 * the status chip, the order rows, the parcel strip and «ΤΑ ΕΡΓΑΛΕΙΑ ΜΟΥ».
 * SERVER components; the only client part is the reorder button.
 */

const TZ = "Europe/Athens";

export function shortDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(date);
}

export function dayMonth(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", timeZone: TZ }).format(date);
}

/** «ΑΠΕΣΤΑΛΗ», «ΠΑΡΑΔΟΘΗΚΕ» … — a word and a colour. */
export async function StatusChip({ status, shippingMethod }: { status: string; shippingMethod: string }) {
  const t = await getTranslations("account.Hdc");
  const chip = statusChip({ status, shippingMethod });
  const word: Record<typeof chip.key, string> = {
    pending_payment: t("chip_pending_payment"),
    confirmed: t("chip_confirmed"),
    shipped: t("chip_shipped"),
    ready: t("chip_ready"),
    delivered: t("chip_delivered"),
    collected: t("chip_collected"),
    cancelled: t("chip_cancelled"),
    failed: t("chip_failed"),
  };
  return (
    <span className="hdc-chip" data-tone={chip.tone}>
      {word[chip.key]}
    </span>
  );
}

/** «ACS Courier», «ACS Express», «Παραλαβή από το κατάστημα». */
export async function shippingLabel(method: string): Promise<string> {
  const t = await getTranslations("account.Hdc");
  return method === "pickup" ? t("paralavi_katastima") : method === "express" ? "ACS Express" : "ACS Courier";
}

/** The rows of «ΠΡΟΣΦΑΤΕΣ ΠΑΡΑΓΓΕΛΙΕΣ» and of the orders page. */
export async function OrderRows({ orders, locale }: { orders: OrderRowData[]; locale: Locale }) {
  const t = await getTranslations("account.Hdc");
  const labels = await Promise.all(orders.map((o) => shippingLabel(o.shippingMethod)));

  return (
    <ul className="hdc-ords">
      {orders.map((order, i) => {
        const href = `/logariasmos/paraggelies/${order.orderNumber}`;
        return (
          <li key={order.orderNumber} className="hdc-ord">
            <div className="no">
              <Link href={href}>{order.orderNumber}</Link>
              <span>
                {shortDate(order.createdAt, locale)} · {labels[i]}
              </span>
            </div>
            <div className="th" aria-hidden>
              {order.thumbs.map((src, j) => (
                <span key={`${src}-${j}`}>
                  <Image src={src} alt="" width={56} height={56} sizes="56px" />
                </span>
              ))}
            </div>
            <div className="st">
              <StatusChip status={order.status} shippingMethod={order.shippingMethod} />
            </div>
            <div className="tt">
              {formatMoney(order.totalGross, locale)}
              {/* A delivered order is one somebody buys again; the rest are
                  still happening, and the question is how they are doing. */}
              {order.status === "DELIVERED" ? (
                <ReorderButton
                  orderNumber={order.orderNumber}
                  token={order.guestToken}
                  locale={locale}
                  variant="text"
                />
              ) : (
                <Link href={href} className="act">
                  {t("leptomereies")}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** «ΤΟ ΔΕΜΑ ΣΑΣ ΕΙΝΑΙ ΚΑΘ' ΟΔΟΝ» — only ever rendered when there is one. */
export async function TrackStrip({
  tracking,
  locale,
}: {
  tracking: { orderNumber: string; voucherNo: string; stages: TrackStage[] };
  locale: Locale;
}) {
  const t = await getTranslations("account.Hdc");
  const today = dayMonth(new Date(), locale);
  const when = (at: string | null) => {
    if (!at) return null;
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed)) return at;
    const d = dayMonth(new Date(parsed), locale);
    return d === today ? t("simera") : d;
  };
  const label: Record<TrackStage["key"], { lg: string; sh: string }> = {
    picked: { lg: t("st_picked"), sh: t("st_picked") },
    sorting: { lg: t("st_sorting"), sh: t("st_sorting_short") },
    delivering: { lg: t("st_delivering"), sh: t("st_delivering_short") },
    delivered: { lg: t("st_delivered"), sh: t("st_delivered_short") },
  };

  return (
    <section className="hdc-track" aria-label={t("to_dema_sas")}>
      <div className="top">
        <div>
          <b>{t("to_dema_sas")}</b>
          <span>
            {tracking.orderNumber} · ACS {tracking.voucherNo}
          </span>
        </div>
        <a
          href={`https://www.acscourier.net/el/track-and-trace/?paramtracknr=${encodeURIComponent(tracking.voucherNo)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("parakolouthisi_acs")}
        </a>
      </div>
      <ol className="hdc-steps">
        {tracking.stages.map((stage) => {
          const at = when(stage.at);
          const sub =
            stage.state === "todo"
              ? "—"
              : [at ?? (stage.state === "now" ? t("simera") : null), stage.place].filter(Boolean).join(" · ") ||
                "—";
          return (
            <li key={stage.key} data-state={stage.state} aria-current={stage.state === "now" ? "step" : undefined}>
              <b>
                <span className="lg">{label[stage.key].lg}</span>
                <span className="sh">{label[stage.key].sh}</span>
              </b>
              <span>{sub}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** «ΤΑ ΕΡΓΑΛΕΙΑ ΜΟΥ» — hidden by the caller when there is nothing on a platform. */
export async function MyToolsBox({
  tools,
  catalogueHref,
  all,
}: {
  tools: PlatformTools[];
  /** The battery-tools category, «/katalogos/…», or the catalogue. */
  catalogueHref: string;
  /** Link «ΟΛΑ →» to the page of its own. */
  all?: boolean;
}) {
  const t = await getTranslations("account.Hdc");
  const ah = (n: number) => n.toFixed(1);

  return (
    <section className="hdc-box">
      <h2 className="hdc-disp">
        {t("ta_ergaleia_mou")}
        {all && <Link href="/logariasmos/ta-ergaleia-mou">{t("ola")} →</Link>}
      </h2>
      <div className="hdc-kit">
        {tools.map((p) => {
          const name = p.platform === "MX" ? "MX FUEL" : p.platform;
          const batteries =
            p.batteries === 0
              ? null
              : p.capacities.length === 1
                ? t("n_mpataries_ah", { count: p.batteries, ah: ah(p.capacities[0]) })
                : t("n_mpataries", { count: p.batteries });
          return (
            <div key={p.platform}>
              <div className="pl">
                <b>{name}</b>
                <span>
                  {t("n_ergaleia", { count: p.tools })}
                  {batteries && ` · ${batteries}`}
                </span>
              </div>
              {p.thumbs.length > 0 && (
                <ul className="own">
                  {p.thumbs.map((thumb, i) => (
                    <li key={`${thumb.kind}-${i}`} title={thumb.name}>
                      {thumb.image && <Image src={thumb.image} alt={thumb.name} width={74} height={74} sizes="74px" />}
                      {thumb.count != null && <em>×{thumb.count}</em>}
                    </li>
                  ))}
                </ul>
              )}
              {p.tip === "bare" && (
                <p className="tip">
                  {t("tip_bare", { count: p.batteries, platform: name })}{" "}
                  <Link href={`${catalogueHref}?platform=${p.platform}&content=bare`}>
                    {t("tip_bare_link")} →
                  </Link>
                </p>
              )}
              {p.tip === "tools" && (
                <p className="tip">
                  {t("tip_tools", { platform: name })}{" "}
                  <Link href={`${catalogueHref}?platform=${p.platform}`}>
                    {t("tip_tools_link", { platform: name })} →
                  </Link>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
