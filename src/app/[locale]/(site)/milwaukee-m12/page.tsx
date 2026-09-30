import { hubRoute } from "@/components/seo/HubPage";

/** The /milwaukee-m12 hub (src/components/seo/HubPage.tsx). */
const route = hubRoute("m12");

export const generateMetadata = route.generateMetadata;
export default route.Page;
