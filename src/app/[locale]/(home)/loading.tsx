import {
  ChromeSkeleton,
  ProductCardSkeleton,
  Shimmer,
} from "@/components/skeleton/Skeleton";

/** The home page's shape while it renders: hero, platform band, categories, best sellers. */
export default function Loading() {
  return (
    <>
      <ChromeSkeleton />
      <main id="main">
        <div className="hdc-hero" aria-hidden />
        <div className="hdc-plat" aria-hidden>
          <div className="hdc-wrap">
            <div className="hdc-plat-grid">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="hdc-plat-tile" />
              ))}
            </div>
          </div>
        </div>
        <section className="hdc-sec">
          <div className="hdc-wrap">
            <Shimmer className="mb-[22px] h-8 w-60" />
            <div className="hdc-cats">
              {Array.from({ length: 8 }, (_, i) => (
                <Shimmer key={i} className="aspect-[1/0.95] rounded-none" />
              ))}
            </div>
          </div>
        </section>
        <section className="hdc-sec">
          <div className="hdc-wrap">
            <Shimmer className="mb-[22px] h-8 w-80" />
            <div className="hdc-cards">
              {Array.from({ length: 5 }, (_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
