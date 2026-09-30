import { hubRoute } from "@/components/seo/HubPage";

/** The /milwaukee hub (src/components/seo/HubPage.tsx). */
const route = hubRoute("milwaukee");

export const generateMetadata = route.generateMetadata;
export default route.Page;
