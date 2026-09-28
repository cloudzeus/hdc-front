import { NextResponse, type NextRequest } from "next/server";
import { getPopularTiles, getSuggestions, SUGGEST_MIN_LENGTH } from "@/lib/catalog/suggest";
import { EMPTY_SUGGEST } from "@/lib/catalog/suggest-types";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Header search suggestions.
 *
 * A route handler rather than a server action: this is a GET that fires on
 * every keystroke, and only a GET can be cached, aborted cleanly by the browser
 * on the next character, and replayed from the back/forward cache.
 *
 * The catalogue changes once a day, so the same query is worth caching for a
 * minute at the edge — a shop-floor customer typing "τρυπανι" letter by letter
 * generates seven requests whose answers are stable.
 *
 * `?popular=1` answers the empty-focus state instead («ΔΗΜΟΦΙΛΗ»): fetched
 * only when someone clicks into an empty field, so no page pays for it.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim() ?? "";

  const requested = params.get("locale");
  const locale: Locale = routing.locales.includes(requested as Locale)
    ? (requested as Locale)
    : routing.defaultLocale;

  if (params.get("popular") === "1") {
    try {
      const popular = await getPopularTiles(locale, 5);
      return NextResponse.json(
        { popular },
        { headers: { "Cache-Control": "private, max-age=300" } },
      );
    } catch (error) {
      console.error("[suggest:popular]", error);
      return NextResponse.json({ popular: [] });
    }
  }

  if (query.length < SUGGEST_MIN_LENGTH) {
    return NextResponse.json(EMPTY_SUGGEST(query));
  }

  try {
    const result = await getSuggestions(query, locale);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    console.error("[suggest]", error);
    return NextResponse.json({ error: "suggest_failed" }, { status: 500 });
  }
}
