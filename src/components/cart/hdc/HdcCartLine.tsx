"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useOptimistic, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { removeCartLine, swapCartLine, updateCartLine } from "@/lib/cart/actions";

/**
 * One cart line (checkout.html, screen 1 `.line`; phone frame `.pl1`).
 *
 * Every string and amount is prepared by the server render — the name through
 * `displayName`, the code line, the prices. Only the quantity is optimistic, so
 * +/- feels instant while the totals, VAT and the free-shipping bar still come
 * from one server computation and can never disagree with each other.
 */
export type HdcCartLineView = {
  id: string;
  href: string;
  name: string;
  /** "4933479860 · M18 FPD3-502X · 2 × 5.0Ah, φορτιστής, HD Box" */
  codeLine: string;
  /** Platform slant tag on the image: "M18 FUEL". */
  tag: string | null;
  image: string | null;
  quantity: number;
  inStock: boolean;
  /** "Σε απόθεμα — 2 τεμάχια" / "Σε απόθεμα" / "Κατόπιν παραγγελίας". */
  availability: string;
  /** Asks for more than the shop holds. */
  overStock: string | null;
  unitPrice: string;
  /** Struck-through price when a campaign discounts the line. */
  unitWas: string | null;
  lineTotal: string;
  swap: { productId: string; label: string } | null;
};

export function HdcCartLine({ line }: { line: HdcCartLineView }) {
  const t = useTranslations("cart.Hdc");
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useOptimistic(line.quantity);

  const setQuantity = (next: number) => {
    if (next < 1 || next > 999) return;
    startTransition(async () => {
      setQty(next);
      await updateCartLine({ lineId: line.id, quantity: next });
    });
  };

  const remove = () =>
    startTransition(async () => {
      setQty(0);
      await removeCartLine(line.id);
    });

  const swap = () =>
    line.swap &&
    startTransition(async () => {
      await swapCartLine({ lineId: line.id, productId: line.swap!.productId });
    });

  return (
    <div className="hdc-cart-line" data-pending={pending || undefined}>
      <div className="pr">
        <Link href={line.href} className="im" prefetch={false} tabIndex={-1} aria-hidden>
          {line.tag && <span className="hdc-slant tag">{line.tag}</span>}
          {line.image ? (
            <Image src={line.image} alt="" width={104} height={104} sizes="104px" />
          ) : (
            <span className="noimg">—</span>
          )}
        </Link>
        <div className="tx">
          <Link href={line.href} className="n" prefetch={false} title={line.name}>
            {line.name}
          </Link>
          <p className="c">{line.codeLine}</p>
          <p className={line.inStock ? "a" : "a wait"}>● {line.availability}</p>
          {line.overStock && <p className="over">{line.overStock}</p>}
          {line.swap && (
            <button type="button" className="sw" onClick={swap} disabled={pending}>
              {line.swap.label}
            </button>
          )}
        </div>
      </div>

      <div className="hdc-qty" role="group" aria-label={t("posotita")}>
        <button
          type="button"
          onClick={() => setQuantity(qty - 1)}
          disabled={qty <= 1 || pending}
          aria-label={t("meiosi")}
        >
          −
        </button>
        <span aria-live="polite">{qty}</span>
        <button
          type="button"
          onClick={() => setQuantity(qty + 1)}
          disabled={pending}
          aria-label={t("ayxisi")}
        >
          +
        </button>
      </div>

      <div className="u">
        {line.unitWas && <s>{line.unitWas}</s>}
        {line.unitPrice}
      </div>
      <div className="t">{line.lineTotal}</div>
      <button
        type="button"
        className="x"
        onClick={remove}
        disabled={pending}
        aria-label={t("afairesi", { name: line.name })}
      >
        ✕
      </button>
    </div>
  );
}
