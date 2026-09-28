import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { SHOP } from "@/config/shop";
import { Link } from "@/i18n/navigation";

const LOCKUP = { src: "/brand/hdc-lockup-440.png", width: 440, height: 183 } as const;

/**
 * The distraction-free header of /checkout (checkout.html, screen 2 `.chdr`,
 * and the second phone frame).
 *
 * No menu, no search, no mini-cart: the lockup on a red plinth, «ΑΣΦΑΛΗΣ
 * ΟΛΟΚΛΗΡΩΣΗ», the phone number, and the one way back — to the cart. It takes
 * the place of `SiteChrome` on this route only; every other page keeps the
 * full chrome. Not sticky, so it never covers the form.
 */
export async function HdcCheckoutHeader() {
  const t = await getTranslations("checkout.Hdc");
  const height = 50;

  return (
    <header className="hdc-chdr">
      <div className="hdc-wrap">
        <Link href="/" className="plinth" aria-label={t("archiki")} prefetch={false}>
          <Image
            src={LOCKUP.src}
            alt=""
            width={Math.round((LOCKUP.width * height) / LOCKUP.height)}
            height={height}
            loading="eager"
            fetchPriority="high"
            unoptimized
          />
        </Link>
        <span className="sec">
          <span aria-hidden>🔒 </span>
          {t("asfalis_oloklirosi")}
        </span>
        <span className="help">
          {t("chreiazeste_voitheia")}{" "}
          <a href={`tel:${SHOP.contact.phoneE164}`}>
            <b>{SHOP.contact.phone}</b>
          </a>
        </span>
        <Link href="/kalathi" className="back" prefetch={false}>
          ← {t("kalathi")}
        </Link>
      </div>
    </header>
  );
}
