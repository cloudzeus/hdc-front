import { getTranslations } from "next-intl/server";
import { HdcProductCard } from "@/components/product/HdcProductCard";
import { Link } from "@/i18n/navigation";
import type { ProductCardData } from "@/lib/catalog/queries";

/**
 * "ΝΕΕΣ ΑΦΙΞΕΙΣ" (mockup `.pipe`, after Milwaukee's "Pipeline" band): graphite
 * with thin red diagonal stripes, an intro column and four flat cards tagged
 * "ΝΕΟ".
 */
export async function NewArrivalsBand({ products }: { products: ProductCardData[] }) {
  if (products.length === 0) return null;
  const t = await getTranslations("home.NewArrivalsBand");

  return (
    <section className="hdc-pipe">
      <div className="hdc-wrap hdc-pipe-inner">
        <div className="hdc-pipe-intro">
          <span className="hdc-slant">{t("neo")}</span>
          <h2 className="hdc-disp">{t("titlos")}</h2>
          <p>{t("keimeno")}</p>
          <div>
            <Link href="/nees-afixeis" prefetch={false} className="hdc-btn hdc-btn-ghost">
              {t("oles")}
            </Link>
          </div>
        </div>
        <div className="hdc-pipe-row">
          {products.map((product) => (
            <HdcProductCard key={product.id} product={product} variant="new" />
          ))}
        </div>
      </div>
    </section>
  );
}
