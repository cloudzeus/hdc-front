import { Link } from "@/i18n/navigation";
import type { VariantOption } from "@/lib/catalog/variants";

/**
 * The size picker of the HDC product page — the bare/kit selector's design
 * language (grey hairline, red 3px border and ✓ corner on the chosen one)
 * shrunk to square buttons.
 *
 * Every size is a LINK to its own page, not state on this one, because that is
 * how the ERP has it: 8/M and 9/L are two codes, each with its own stock, price
 * and EAN. The page it opens shows that size's code, price and availability,
 * and «ΣΤΟ ΚΑΛΑΘΙ» there adds exactly that code. It needs no JavaScript, the
 * back button works, and each size keeps an address that can be shared.
 *
 * Sizes out of stock stay, dashed and grey — a size missing from the row is
 * one the customer never learns exists. A size only the supplier has is solid
 * and amber: it can be bought, in 3–5 working days.
 */
export function HdcSizePicker({
  options,
  label,
  status,
  navLabel,
  titleOf,
}: {
  options: VariantOption[];
  /** «ΜΕΓΕΘΟΣ». */
  label: string;
  /** «3 ΑΠΟ 5 ΣΕ ΑΠΟΘΕΜΑ». */
  status: string;
  /** The group's accessible name. */
  navLabel: string;
  /** The tooltip / accessible name of one size. */
  titleOf: (option: VariantOption) => string;
}) {
  // One size is no choice; the picker would be decoration.
  if (options.length < 2) return null;

  return (
    <div className="hdc-pdp-sizes">
      <div className="hdc-pdp-sizes-lbl">
        <span>{label}</span>
        <span className="s">{status}</span>
      </div>
      <nav aria-label={navLabel}>
        <ul className="hdc-pdp-sizes-row">
          {options.map((option) => {
            const title = titleOf(option);
            const cls = `hdc-pdp-size${option.inStock ? "" : option.supplierAvailable ? " sup" : " out"}`;
            return (
              <li key={option.slug}>
                {option.current ? (
                  <span className={`${cls} on`} aria-current="page" title={title}>
                    {option.label}
                  </span>
                ) : (
                  <Link
                    href={`/proion/${option.slug}`}
                    className={cls}
                    title={title}
                    aria-label={title}
                    prefetch={false}
                    scroll={false}
                  >
                    {option.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
