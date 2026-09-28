"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { isHdcNavActive } from "@/lib/hdc-nav";

/**
 * The five header links, with the white 4px underline on the page being read.
 *
 * A client island only because the active item depends on the pathname; the
 * links and labels arrive resolved and translated from the server.
 */
export function HeaderNav({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="hdc-nav">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={isHdcNavActive(item.href, pathname) ? "page" : undefined}
          prefetch={false}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
