import { ChromeSkeleton, Shimmer } from "@/components/skeleton/Skeleton";

/**
 * The HDC product page while it renders. Built from the page's own classes
 * (pdp.css), so the gallery, the buy box and the section bar take the boxes
 * the real page will fill and nothing moves when it lands.
 */
export default function Loading() {
  return (
    <>
      <ChromeSkeleton />
      <main id="main" className="hdc-pdp-page" aria-busy="true">
        <div className="hdc-wrap hdc-pdp-crumb">
          <Shimmer className="h-3 w-72" />
        </div>
        <div className="hdc-wrap hdc-pdp-top">
          <div className="hdc-pdp-gal">
            <div className="hdc-pdp-thumbs">
              {Array.from({ length: 4 }, (_, i) => (
                <Shimmer key={i} className="h-[84px] w-[84px] rounded-none" />
              ))}
            </div>
            <Shimmer className="aspect-square w-full rounded-none" />
          </div>
          <div className="hdc-pdp-buy">
            <Shimmer className="mt-1 h-6 w-28 rounded-none" />
            <Shimmer className="mt-4 h-24 w-full rounded-none" />
            <Shimmer className="mt-6 h-4 w-3/4 rounded-none" />
            <Shimmer className="mt-6 h-[75px] w-full rounded-none" />
            <Shimmer className="mt-6 h-[140px] w-full rounded-none" />
            <Shimmer className="mt-6 h-[200px] w-full rounded-none" />
          </div>
        </div>
        <div className="hdc-pdp-secnav" aria-hidden>
          <div className="hdc-wrap" />
        </div>
      </main>
    </>
  );
}
