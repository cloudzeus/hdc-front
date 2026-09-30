import { articleDetailRoute } from "@/components/blog/article-routes";

/**
 * A buying guide (`ContentArticle` GUIDE, PUBLISHED only). A real 404 for an
 * unknown or unpublished slug — no loading.tsx above this route.
 */
const route = articleDetailRoute("GUIDE");

export const generateMetadata = route.generateMetadata;
export default route.Page;
