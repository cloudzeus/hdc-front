import { hubRoute } from "@/components/seo/HubPage";

/** The /milwaukee-m18 hub (src/components/seo/HubPage.tsx). */
const route = hubRoute("m18");

export const generateMetadata = route.generateMetadata;
export default route.Page;
