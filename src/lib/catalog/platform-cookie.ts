import { SHOP } from "@/config/shop";

/**
 * The battery platform the visitor picked, remembered across visits.
 *
 * Written by the mega menu's battery switch and by the platform control of the
 * category pages; read by both. On a category page it is only a DEFAULT: an
 * explicit `?platform=` in the address always wins, and «ΟΛΕΣ» there clears
 * it. Not personal data — one of three model families, nothing else.
 */
export const PLATFORM_COOKIE = `${SHOP.cookiePrefix}PLATFORM`;

export type RememberedPlatform = "M12" | "M18" | "MX";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** The cookie's value, if it is one of the three platforms. Pure. */
export function parsePlatformCookie(
  value: string | null | undefined,
): RememberedPlatform | undefined {
  const v = value?.trim().toUpperCase();
  return v === "M12" || v === "M18" || v === "MX" ? v : undefined;
}

/** Browser only: the remembered platform, or undefined. */
export function readPlatformCookie(): RememberedPlatform | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PLATFORM_COOKIE}=`));
  return parsePlatformCookie(match?.slice(PLATFORM_COOKIE.length + 1));
}

/** Browser only: remembers a platform; «all» (or nothing) forgets it. */
export function writePlatformCookie(platform: string | null | undefined): void {
  if (typeof document === "undefined") return;
  const value = parsePlatformCookie(platform);
  document.cookie = value
    ? `${PLATFORM_COOKIE}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`
    : `${PLATFORM_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
