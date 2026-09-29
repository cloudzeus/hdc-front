"use client";

import { useRouter } from "@/i18n/navigation";

export type SortChoice = { value: string; label: string; href: string };

/**
 * «ΤΑΞΙΝΟΜΗΣΗ» — a native select whose options carry ready-made links.
 *
 * The hrefs are built on the server from the current URL, so this leaf only
 * navigates; it never reads or rewrites the query itself.
 *
 *  - `box`: the toolbar's bordered 210px box (plp.html `.sort div`).
 *  - `bar`: the white half of the phone bar; the select is invisible and
 *    covers the whole button, so a tap opens the phone's own picker.
 */
export function HdcSortSelect({
  value,
  options,
  label,
  variant = "box",
}: {
  value: string;
  options: SortChoice[];
  label: string;
  variant?: "box" | "bar";
}) {
  const router = useRouter();
  const onChange = (next: string) => {
    const choice = options.find((o) => o.value === next);
    if (choice) router.push(choice.href, { scroll: false });
  };

  if (variant === "bar") {
    return (
      <label className="hdc-mbar-sort">
        <span className="hdc-mbar-label">{label}</span>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="hdc-sort">
      <span>{label}</span>
      <span className="hdc-sort-box">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span aria-hidden>⌄</span>
      </span>
    </label>
  );
}
