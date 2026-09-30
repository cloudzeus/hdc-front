import { articleIndexRoute } from "@/components/blog/article-routes";

/** The buying guides: published, newest first (`ContentArticle` GUIDE). */
const route = articleIndexRoute("GUIDE");

export const generateMetadata = route.generateMetadata;
export default route.Page;
