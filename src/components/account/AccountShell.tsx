import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/account/actions";
import type { AccountShellData } from "@/lib/account/dashboard";
import { customerSince } from "@/lib/account/order-view";

/**
 * The account frame (account.html, screen 2) — a SERVER component.
 *
 * Black bar with the page title and «ΠΕΛΑΤΗΣ ΑΠΟ … · N ΠΑΡΑΓΓΕΛΙΕΣ», the side
 * nav with counts and the red left border on the page being viewed, and the
 * main column. Below 1024px the side nav becomes a tab strip that scrolls on
 * its own (the phone frame), so the page itself never scrolls sideways.
 *
 * One kind of account: the company items (partner pricing, users and roles)
 * went with the B2B area. Presentational — the page loads `shell`, so the
 * development preview can render the frame with fixtures.
 */

type Item = { href: string; key: NavKey; count?: number; isNew?: boolean };
type NavKey = "overview" | "orders" | "tools" | "addresses" | "favourites" | "reviews" | "details";

export async function AccountShell({
  shell,
  active,
  title,
  children,
}: {
  shell: AccountShellData;
  /** The nav item's href; an order page passes the orders list. */
  active: string;
  /** The black bar's heading. */
  title: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("account.Hdc");
  const locale = await getLocale();

  const items: Item[] = [
    { href: "/logariasmos", key: "overview" },
    { href: "/logariasmos/paraggelies", key: "orders", count: shell.orders },
    { href: "/logariasmos/ta-ergaleia-mou", key: "tools", isNew: true },
    { href: "/logariasmos/dieuthynseis", key: "addresses", count: shell.addresses },
    { href: "/logariasmos/agapimena", key: "favourites", count: shell.favourites },
    { href: "/logariasmos/axiologiseis", key: "reviews" },
    { href: "/logariasmos/stoicheia", key: "details" },
  ];
  const label: Record<NavKey, string> = {
    overview: t("nav_overview"),
    orders: t("nav_orders"),
    tools: t("nav_tools"),
    addresses: t("nav_addresses"),
    favourites: t("nav_favourites"),
    reviews: t("nav_reviews"),
    details: t("nav_details"),
  };

  const links = (withCounts: boolean) =>
    items.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        aria-current={item.href === active ? "page" : undefined}
      >
        {label[item.key]}
        {item.isNew ? (
          <em>{t("neo")}</em>
        ) : withCounts && item.count ? (
          <span>{item.count}</span>
        ) : null}
      </Link>
    ));

  const signOutForm = (
    <form action={signOut}>
      <button type="submit">{t("aposyndesi")}</button>
    </form>
  );

  return (
    <main id="main" className="hdc-acc-page">
      <div className="hdc-acbar">
        <div className="hdc-wrap">
          <div>
            <h1 className="hdc-disp">{title}</h1>
            <p>
              {t("pelatis_apo", { since: customerSince(shell.createdAt, locale) })}
              {" · "}
              {t("n_paraggelies", { count: shell.orders })}
            </p>
          </div>
          <form action={signOut}>
            <button type="submit" className="out">
              {t("aposyndesi")}
            </button>
          </form>
        </div>
      </div>

      <div className="hdc-wrap hdc-acc">
        <nav className="hdc-tabs" aria-label={t("menou_logariasmou")}>
          {links(false)}
          {signOutForm}
        </nav>
        <nav className="hdc-side" aria-label={t("menou_logariasmou")}>
          {links(true)}
          {signOutForm}
        </nav>
        <div className="hdc-acc-main">{children}</div>
      </div>
    </main>
  );
}
