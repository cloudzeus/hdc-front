import { NextResponse, type NextRequest } from "next/server";
import { routing, type Locale } from "@/i18n/routing";
import { getMegaMenu } from "@/lib/catalog/mega-menu";

/**
 * The mega menu's data, fetched by the header the first time someone points at
 * it (or opens the phone drawer) rather than embedded in every page.
 *
 * Embedded, the menu is ~75 KB of JSON in the flight data of every page — for
 * a panel most visits never open. Fetched, it costs nothing until wanted, and
 * the shared ten-minute cache behind `getMegaMenu` answers from memory.
 *
 * `null` means HDCtool's tree could not be read; the header then behaves as
 * five plain links.
 */
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("locale");
  const locale: Locale = routing.locales.includes(requested as Locale)
    ? (requested as Locale)
    : routing.defaultLocale;

  const menu = await getMegaMenu(locale);
  return NextResponse.json(
    { menu },
    { headers: { "Cache-Control": menu ? "public, max-age=300" : "no-store" } },
  );
}
