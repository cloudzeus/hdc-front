import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getMenuTree } from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

/**
 * Every root category with its main groups, as plain links in the footer.
 *
 * The mega menu loads its tree from an API when opened, so to a crawler the
 * site's second level did not exist in the HTML: the groups were reachable
 * only through the category pages. Server-rendered here, on every page, from
 * the same cached tree the menu uses.
 *
 * Folded into one closed `<details>` row so the footer keeps its layout: the
 * links are in the HTML for crawlers, and a visitor opens them only if wanted.
 */
export async function FooterCategories() {
  const requested = await getLocale();
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const [t, tree] = await Promise.all([getTranslations("chrome.SiteFooter"), getMenuTree(locale)]);
  if (tree.length === 0) return null;

  return (
    <details className="hdc-foot-cats">
      <summary>{upGreek(t("katigories"))}</summary>
      <nav aria-label={t("katigories")}>
        {tree.map((root) => (
          <div key={root.slug}>
            <Link href={`/katalogos/${root.slug}`} prefetch={false} className="hdc-foot-cat">
              {root.name}
            </Link>
            {root.children.length > 0 && (
              <ul>
                {root.children.map((child) => (
                  <li key={child.slug}>
                    <Link href={`/katalogos/${child.slug}`} prefetch={false}>
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </nav>
    </details>
  );
}
