import { ChromeSkeleton, ProductCardSkeleton, Shimmer } from "@/components/skeleton/Skeleton";

/**
 * The HDC listing while it renders — category page and search results.
 *
 * Built from the page's own classes (plp.css), so the band, the platform
 * control, the 270px filter column and the grid take the same boxes the real
 * page will fill and nothing moves when it lands.
 */
export function HdcPlpSkeleton({ variant = "category" }: { variant?: "category" | "search" }) {
  return (
    <>
      <ChromeSkeleton />
      <main id="main" className="hdc-plp-page" aria-busy="true">
        {variant === "category" ? (
          <>
            <div className="hdc-wrap hdc-crumb">
              <Shimmer className="h-3 w-40" />
            </div>
            <section className="hdc-band">
              <div className="hdc-wrap">
                <div>
                  <Shimmer className="mb-3 h-12 w-[min(560px,80%)] bg-white/12" />
                  <Shimmer className="h-3 w-[min(520px,90%)] bg-white/8" />
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="hdc-rband">
            <div className="hdc-wrap">
              <Shimmer className="mb-3 h-3 w-40 bg-white/10" />
              <Shimmer className="h-10 w-[min(560px,80%)] bg-white/12" />
            </div>
          </section>
        )}
        <div className="hdc-wrap hdc-plp">
          <div className="hdc-pfc">
            <div className="hdc-pfc-grid">
              {Array.from({ length: 4 }, (_, i) => (
                <Shimmer key={i} className="h-[58px] rounded-none" />
              ))}
            </div>
          </div>
          <div className="hdc-plp-body">
            <div className="hdc-filters">
              <Shimmer className="h-[280px] w-full rounded-none" />
            </div>
            <div className="hdc-plp-main">
              <Shimmer className="mb-4 h-11 w-full rounded-none" />
              <div className="hdc-plp-grid">
                {Array.from({ length: 8 }, (_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
