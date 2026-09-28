"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { clearCart } from "@/lib/cart/actions";

/**
 * «← ΣΥΝΕΧΕΙΑ ΑΓΟΡΩΝ» / «Άδειασμα καλαθιού» (checkout.html `.cartacts`).
 *
 * Emptying asks first — it is the one action here that cannot be undone, and a
 * misclick loses a basket someone spent ten minutes assembling.
 */
export function CartActionsRow() {
  const t = useTranslations("cart.CartActionsRow");
  const [pending, startTransition] = useTransition();

  return (
    <div className="hdc-cart-acts">
      <Link href="/katalogos" className="back">
        {t("synecheia_agoron")}
      </Link>

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("na_adeiasei_to_kalathi"))) return;
          startTransition(async () => {
            await clearCart();
          });
        }}
        className="clear"
      >
        {t("adeiasma_kalathioy")}
      </button>
    </div>
  );
}
