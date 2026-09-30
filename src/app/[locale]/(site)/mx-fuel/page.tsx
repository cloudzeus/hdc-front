import { hubRoute } from "@/components/seo/HubPage";

/** The /mx-fuel hub (src/components/seo/HubPage.tsx). */
const route = hubRoute("mx-fuel");

export const generateMetadata = route.generateMetadata;
export default route.Page;
