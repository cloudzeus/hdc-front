import { AnnouncementBar } from "@/components/chrome/AnnouncementBar";
import { HeaderShell } from "@/components/chrome/HeaderShell";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import type { Locale } from "@/i18n/routing";
import type { MiniCartSummary } from "@/lib/cart/options";
import type { BrandTile, MenuCategory, ProductCardData } from "@/lib/catalog/queries";

/**
 * The whole top of the page — announcement bar and the red HDC header — as one
 * server component inside the sticky shell.
 *
 * Every page wires it the same way, which is the point: one place to forget
 * nothing. `HeaderShell` is the only client wrapper and it takes these as
 * children, so the search field and the mini-cart are server-rendered into the
 * first paint.
 *
 * The signature is unchanged from the Kolleris chrome. `brands`, `stats` and
 * `featured` fed the old mega menu and brand links; the HDC header has neither
 * (the HDC mega menu is Plan 3, Task 8), so they are accepted and unused until
 * then rather than touched in thirty pages twice.
 */
export function SiteChrome({
  locale,
  cart,
  categories,
}: {
  locale: Locale;
  cart: MiniCartSummary | null;
  categories: MenuCategory[];
  brands: BrandTile[];
  stats: {
    products: number;
    brands: number;
    categories: number;
    subcategories: number;
  };
  featured?: ProductCardData | null;
}) {
  return (
    <HeaderShell>
      <AnnouncementBar />
      <SiteHeader locale={locale} cart={cart} categories={categories} />
    </HeaderShell>
  );
}
