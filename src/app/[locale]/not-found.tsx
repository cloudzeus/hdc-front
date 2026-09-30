import { NotFoundView } from "@/components/seo/NotFoundView";

/**
 * Every `notFound()` under /[locale] — an unknown product, category, model,
 * article or brand — renders the shop's own 404, inside the storefront chrome,
 * with a real 404 status (see route-boundaries.test.ts).
 */
export default function NotFound() {
  return <NotFoundView />;
}
