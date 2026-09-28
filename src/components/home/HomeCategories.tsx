import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { HomeCategoryCard } from "@/lib/hdc-home";
import { HomeSectionHead } from "./HomeSectionHead";

/**
 * "ΚΑΤΗΓΟΡΙΕΣ" (mockup `.cats`): eight cards, a grey image area over a black
 * label bar that turns red on hover. Which synced category each card opens,
 * and its group count, come from `resolveHomeCategories` (lib/hdc-home.ts).
 */
export async function HomeCategories({ cards }: { cards: HomeCategoryCard[] }) {
  const t = await getTranslations("home.HomeCategories");

  return (
    <section className="hdc-sec">
      <div className="hdc-wrap">
        <HomeSectionHead
          title={t("titlos")}
          link={{ href: "/katalogos", label: `${t("oles")} →` }}
        />
        <div className="hdc-cats">
          {cards.map((card) => (
            <Link key={card.key} href={card.href} prefetch={false} className="hdc-cat">
              <div className="hdc-cat-im">
                <Image src={card.image} alt="" width={320} height={256} sizes="(max-width: 1023px) 45vw, 320px" />
              </div>
              <div className="hdc-cat-lb">
                {t(`onoma_${card.key}`)}
                {card.groups != null && <span>{t("omades", { count: card.groups })}</span>}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
