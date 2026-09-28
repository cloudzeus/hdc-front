"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { addToCart } from "@/lib/cart/actions";

/**
 * «ΔΟΥΛΕΥΟΥΝ ΜΕ ΤΙΣ ΜΠΑΤΑΡΙΕΣ ΣΑΣ» (checkout.html, screen 1 `.xs`): four
 * horizontal mini cards. The items and the heading are chosen on the server
 * (`getHdcCrossSell`); this only adds to the cart.
 */
export function HdcCartCrossSell({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: Array<{ id: string; href: string; name: string; image: string | null; price: string }>;
}) {
  const t = useTranslations("cart.Hdc");
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <section className="hdc-wrap hdc-cart-xs" aria-labelledby="cart-xs-title">
      <h2 id="cart-xs-title" className="hdc-disp">
        {title}
      </h2>
      <p className="s">{subtitle}</p>
      <div className="grid" data-pending={pending || undefined}>
        {items.map((item) => (
          <article key={item.id} className="card">
            <Link href={item.href} className="ci" prefetch={false} tabIndex={-1} aria-hidden>
              {item.image ? (
                <Image src={item.image} alt="" width={110} height={110} sizes="110px" />
              ) : (
                <span className="noimg">—</span>
              )}
            </Link>
            <div className="cb">
              <Link href={item.href} className="t" prefetch={false} title={item.name}>
                {item.name}
              </Link>
              <p className="p">{item.price}</p>
              <button
                type="button"
                className="add"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await addToCart({ productId: item.id, quantity: 1 });
                    if (result.ok) setAdded(item.id);
                  })
                }
              >
                {added === item.id ? `✓ ${t("prostethike")}` : `+ ${t("sto_kalathi")}`}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
