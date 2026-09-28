"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { FavouriteButton } from "@/components/product/FavouriteButton";
import { Link } from "@/i18n/navigation";
import { toggleCompare } from "@/lib/compare/actions";

/**
 * The buy row of the price box (pdp.html `.cta` + `.subacts`): quantity,
 * «ΣΤΟ ΚΑΛΑΘΙ», the heart; under it Σύγκριση · Κοινοποίηση · Ερώτηση.
 *
 * Same actions as everywhere else in the shop — `addToCart`, `toggleFavourite`,
 * `toggleCompare` — only the look is the mockup's. `id="hdc-pdp-cta"` is what
 * the section bar watches to know when to show its own small button.
 */
export function HdcBuyActions({
  productId,
  slug,
  disabled,
  favourite,
  compare,
  questionHref,
  shareTitle,
}: {
  productId: string;
  slug: string;
  disabled: boolean;
  favourite: boolean;
  compare: { selected: boolean; disabled: boolean };
  questionHref: string;
  shareTitle: string;
}) {
  const t = useTranslations("pdp.Hdc");
  const [quantity, setQuantity] = useState(1);
  const [compared, setCompared] = useState(compare.selected);
  const [compareNote, setCompareNote] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [pending, startTransition] = useTransition();

  const onCompare = () => {
    setCompareNote(null);
    startTransition(async () => {
      const result = await toggleCompare({ slug });
      if (result.ok) {
        setCompared(result.selected);
        return;
      }
      setCompareNote(result.error === "full" ? t("sygkrisi_gemati") : t("sygkrisi_alli_kat"));
      setTimeout(() => setCompareNote(null), 2600);
    });
  };

  /* The phone's own share sheet where there is one; otherwise copy the link. */
  const onShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2200);
    } catch {
      /* Dismissed share sheet, or no clipboard permission: nothing to report. */
    }
  };

  return (
    <>
      <div className="hdc-pdp-cta" id="hdc-pdp-cta">
        <div className="hdc-pdp-qty" role="group" aria-label={t("posotita")}>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label={t("meiosi")}
            disabled={quantity <= 1}
          >
            −
          </button>
          <span aria-live="polite">{quantity}</span>
          <button type="button" onClick={() => setQuantity((q) => Math.min(99, q + 1))} aria-label={t("ayxisi")}>
            +
          </button>
        </div>
        <AddToCartButton
          productId={productId}
          quantity={quantity}
          disabled={disabled}
          label={t("sto_kalathi")}
          className="hdc-btn hdc-btn-red hdc-btn-lg hdc-pdp-add"
        />
        <FavouriteButton productId={productId} initial={favourite} className="hdc-pdp-fav" />
      </div>

      <div className="hdc-pdp-subacts">
        <button
          type="button"
          onClick={onCompare}
          disabled={pending || (compare.disabled && !compared)}
          aria-pressed={compared}
          title={compare.disabled && !compared ? t("sygkrisi_alli_kat") : undefined}
        >
          {compareNote ?? (compared ? t("sti_sygkrisi") : t("sygkrisi"))}
        </button>
        <button type="button" onClick={onShare}>
          {shared ? t("antigrafike") : t("koinopoiisi")}
        </button>
        <Link href={questionHref} prefetch={false}>
          {t("erotisi")}
        </Link>
      </div>
    </>
  );
}
