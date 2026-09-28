import { getTranslations } from "next-intl/server";
import { HdcProductCard } from "@/components/product/HdcProductCard";
import type { ProductCardData } from "@/lib/catalog/queries";
import { HomeSectionHead } from "./HomeSectionHead";

/** "ΚΟΡΥΦΑΙΕΣ ΠΩΛΗΣΕΙΣ" (mockup `.cards`): five product cards in a row. */
export async function BestSellers({ products }: { products: ProductCardData[] }) {
  if (products.length === 0) return null;
  const t = await getTranslations("home.BestSellers");

  return (
    <section className="hdc-sec">
      <div className="hdc-wrap">
        <HomeSectionHead
          title={t("titlos")}
          link={{ href: "/proionta", label: `${t("ola_ta_proionta")} →` }}
        />
        <div className="hdc-cards">
          {products.map((product) => (
            <HdcProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
