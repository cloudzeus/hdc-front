"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the busy listing after a few seconds, in place: the URL, the
 * scroll position and the client state stay, and the next try either gets a
 * render slot or shows this view again. Cleared on unmount, so a visitor who
 * has already clicked away is not refreshed somewhere else.
 */
export function ListingBusyRefresh({ afterMs = 5_000 }: { afterMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.refresh(), afterMs);
    return () => clearTimeout(timer);
  }, [router, afterMs]);
  return null;
}
