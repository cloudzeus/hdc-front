import { Heart, User } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { MiniCart } from "@/components/cart/MiniCart";
import { HeaderMega } from "@/components/chrome/MegaMenu/HeaderMega";
import { MobileHeader } from "@/components/chrome/MobileHeader";
import { MobileMenu } from "@/components/chrome/MobileMenu";
import { SearchSuggest } from "@/components/chrome/SearchSuggest";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { MiniCartSummary } from "@/lib/cart/options";
import type { MenuCategory } from "@/lib/catalog/queries";
import { resolveHdcNav } from "@/lib/hdc-nav";

const LOCKUP = { src: "/brand/hdc-lockup-440.png", width: 440, height: 183 } as const;

/**
 * The red HDC header (mockup `home.html` `.hdr`, phone frames in `plp.html`).
 *
 * Desktop, from 1024px: the lockup on a black plinth (the lockup carries the
 * red Milwaukee box, which would vanish on the red bar), five links, the white
 * search box and ♡ ◯ 🛒. Below 1024px: the 56px phone bar, with search in a
 * row that opens under it and everything else in the drawer.
 *
 * Server-rendered; the islands are the nav with its mega menu, the search
 * field, the mini-cart, the drawer and the phone search toggle.
 */
export function SiteHeader({
  locale,
  cart,
  categories,
}: {
  locale: Locale;
  cart: MiniCartSummary | null;
  categories: MenuCategory[];
}) {
  const t = useTranslations("chrome.SiteHeader");
  const resolved = resolveHdcNav(categories);
  const nav = resolved.map((item) => ({
    key: item.key,
    href: item.href,
    label: t(`nav_${item.key}`),
  }));
  // The search panel's PACKOUT chip goes where the menu's PACKOUT link goes.
  const packoutHref = resolved.find((item) => item.key === "packout")?.href ?? "/anazitisi?q=PACKOUT";

  const lockup = (height: number) => (
    <Link href="/" className="hdc-plinth" aria-label={t("archiki")} prefetch={false}>
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
  );

  return (
    <>
      {/* ── Phone ─────────────────────────────────────────────── */}
      <MobileHeader
        home={lockup(34)}
        searchLabel={t("anazitisi")}
        locale={locale}
        packoutHref={packoutHref}
        actions={
          <>
            <Link
              href="/logariasmos/agapimena"
              className="hdc-act"
              aria-label={t("agapimena")}
              prefetch={false}
            >
              <Heart aria-hidden strokeWidth={2.2} />
            </Link>
            <MiniCart cart={cart} variant="mobile" />
            <MobileMenu categories={categories} nav={nav} />
          </>
        }
      />

      {/* ── Desktop ───────────────────────────────────────────── */}
      <div className="hdc-hdr hidden lg:block">
        <div className="hdc-wrap">
          {lockup(58)}

          <HeaderMega label={t("kyria_ploigisi")} items={nav} packoutHref={packoutHref} />

          <div className="hdc-hdr-search">
            <SearchSuggest locale={locale} packoutHref={packoutHref} />
          </div>

          <div className="hdc-acts">
            <Link
              href="/logariasmos/agapimena"
              className="hdc-act"
              aria-label={t("agapimena")}
              title={t("agapimena")}
              prefetch={false}
            >
              <Heart aria-hidden strokeWidth={2.2} />
            </Link>
            <Link
              href="/logariasmos"
              className="hdc-act"
              aria-label={t("logariasmos")}
              title={t("logariasmos")}
              prefetch={false}
            >
              <User aria-hidden strokeWidth={2.2} />
            </Link>
            <MiniCart cart={cart} />
          </div>
        </div>
      </div>
    </>
  );
}
