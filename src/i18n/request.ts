import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { getMergedMessages } from "@/lib/content/messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    // Catalogue with the admin's per-locale overrides merged over it. A failed
    // override read falls back to the compiled catalogue inside this call, so
    // the storefront's copy can never go blank because of this layer.
    messages: await getMergedMessages(locale),
    timeZone: "Europe/Athens",
    formats: {
      dateTime: {
        short: { day: "2-digit", month: "2-digit", year: "numeric" },
      },
    },
  };
});
