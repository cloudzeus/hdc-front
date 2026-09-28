import { useTranslations } from "next-intl";
import Image from "next/image";
import { PRIMARY_PHONE, SHOP } from "@/config/shop";
import { Link } from "@/i18n/navigation";
import type { CategoryTile } from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { hoursMessageArgs } from "@/lib/contact/hours";
import { resolveHdcNav } from "@/lib/hdc-nav";

/*
 * `prefetch={false}` on every link here: the footer is on every page, nobody
 * follows all of its links, and every prefetch is a full server render (the
 * pages answer `no-store`, they read the cart and locale from cookies).
 */

const PAYMENTS = ["VISA", "MASTERCARD", "IRIS"] as const;

/**
 * The platforms column. There are no platform pages yet (the platform filter
 * arrives with the new catalogue, Plan 3 Task 3), so each opens a search for
 * the platform's name — a real, non-empty page today.
 */
const PLATFORMS = [
  { label: "M12", q: "M12" },
  { label: "M18", q: "M18" },
  /* The ERP writes the platform as "MXF": a search for "MX FUEL" finds nothing. */
  { label: "MX FUEL", q: "MXF" },
  { label: "ONE-KEY™", q: "ONE-KEY" },
  { label: "REDLITHIUM™", q: "REDLITHIUM" },
] as const;

/**
 * The HDC footer (mockup `home.html` `footer`): black, four columns — lockup,
 * contact and payment marks; shop; service; platforms — then the legal line.
 *
 * The operating company appears here and only here, as the company that runs
 * the HDC. Its details, and the contact placeholders, come from `SHOP` in
 * src/config/shop.ts so they change in one place.
 *
 * `categories` (the synced root categories) is what the shop column resolves
 * its category links against.
 */
export function SiteFooter({ categories }: { categories: CategoryTile[] }) {
  const t = useTranslations("chrome.SiteFooter");
  const { contact, operator } = SHOP;
  const nav = Object.fromEntries(resolveHdcNav(categories).map((i) => [i.key, i.href]));

  const columns = [
    {
      title: t("katastima"),
      links: [
        { href: nav.battery, label: t("ergaleia_mpatarias") },
        { href: nav.accessories, label: t("axesouar") },
        { href: nav.packout, label: "PACKOUT" },
        { href: nav.hand, label: t("ergaleia_cheiros") },
        { href: "/prosfores", label: t("prosfores") },
        { href: "/nees-afixeis", label: t("nees_afixeis") },
        { href: "/etaireia", label: t("schetika") },
      ],
    },
    {
      title: t("exypiretisi"),
      links: [
        { href: "/logariasmos/entopismos", label: t("entopismos_paraggelias") },
        { href: "/apostoli-paradosi", label: t("apostoli_paradosi") },
        { href: "/tropoi-pliromis", label: t("tropoi_pliromis") },
        { href: "/epistrofes", label: t("epistrofes") },
        { href: "/eggyiseis", label: t("eggyiseis") },
        { href: "/syxnes-erotiseis", label: t("sychnes_erotiseis") },
        { href: "/epikoinonia", label: t("epikoinonia") },
      ],
    },
    {
      title: t("platformes"),
      links: PLATFORMS.map((p) => ({
        href: `/anazitisi?q=${encodeURIComponent(p.q)}`,
        label: p.label,
      })),
    },
  ];

  return (
    <footer className="hdc-foot">
      <div className="hdc-wrap">
        <div className="hdc-foot-top">
          <div>
            <Image
              src="/brand/hdc-lockup-440.png"
              alt={SHOP.name}
              width={159}
              height={66}
              unoptimized
              className="hdc-foot-logo"
            />
            <address className="hdc-foot-contact">
              <a href={`tel:${PRIMARY_PHONE.e164}`}>
                <strong>{PRIMARY_PHONE.display}</strong>
              </a>
              <br />
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
              <br />
              {contact.address}
              <br />
              {t("orario", hoursMessageArgs(contact.hours))}
            </address>
            <ul className="hdc-foot-pay" aria-label={t("pliromes")}>
              {PAYMENTS.map((payment) => (
                <li key={payment}>{payment}</li>
              ))}
              <li>{upGreek(t("trapeza"))}</li>
            </ul>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2>{upGreek(column.title)}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} prefetch={false}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="hdc-foot-legal">
          <div>
            <p>
              {t.rich("operator", {
                company: operator.name,
                vat: operator.vat,
                gemi: operator.gemi,
                b: (chunks) => <b>{chunks}</b>,
              })}
            </p>
            <p>{t("trademarks")}</p>
          </div>
          <nav aria-label={t("nomika")}>
            <Link href="/oroi-chrisis" prefetch={false}>
              {t("oroi_chrisis")}
            </Link>
            {" · "}
            <Link href="/aporrito" prefetch={false}>
              {t("aporrito")}
            </Link>
            {" · "}
            {/* No cookie page of its own: the cookie policy is a section of
                the privacy page, anchored. */}
            <Link href="/aporrito#cookies" prefetch={false}>
              {t("cookies")}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
