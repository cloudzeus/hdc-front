import "server-only";
import { routing, type Locale } from "@/i18n/routing";

/**
 * The language of the page that asked for an email (sign-up, reset, verify,
 * newsletter): the customer is reading that language right now.
 *
 * Outside a localised request (a webhook, a script, a test) there is none,
 * and the email is Greek.
 */
export async function requestLocale(): Promise<Locale> {
  try {
    const { getLocale } = await import("next-intl/server");
    const locale = await getLocale();
    return routing.locales.includes(locale as Locale) ? (locale as Locale) : "el";
  } catch {
    return "el";
  }
}
