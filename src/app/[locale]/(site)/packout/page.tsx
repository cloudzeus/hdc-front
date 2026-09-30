import { hubRoute } from "@/components/seo/HubPage";

/** The /packout hub (src/components/seo/HubPage.tsx). */
const route = hubRoute("packout");

export const generateMetadata = route.generateMetadata;
export default route.Page;
