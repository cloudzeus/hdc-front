"use client";

import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import { writePlatformCookie } from "@/lib/catalog/platform-cookie";

/**
 * A link of the platform control that also remembers the choice.
 *
 * M12 / M18 / MX FUEL are written to the platform cookie, as the mega menu's
 * battery switch does; «ΟΛΕΣ» (and the ✕ of the platform chip) forget it, so
 * the next category page no longer opens pre-filtered.
 */
export function PlatformLink({
  platform,
  ...props
}: ComponentProps<typeof Link> & { platform: string | null }) {
  return <Link {...props} onClick={() => writePlatformCookie(platform)} />;
}
