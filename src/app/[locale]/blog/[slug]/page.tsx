import { articleDetailRoute } from "@/components/blog/article-routes";

/**
 * A blog article, from the storefront's database (`ContentArticle` ARTICLE,
 * PUBLISHED only). An unknown or unpublished slug answers a real 404: no
 * loading.tsx sits above this route, so nothing streams before `notFound()`.
 */
const route = articleDetailRoute("ARTICLE");

export const generateMetadata = route.generateMetadata;
export default route.Page;
