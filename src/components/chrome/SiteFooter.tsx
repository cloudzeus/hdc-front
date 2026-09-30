import { useTranslations } from "next-intl";
import Image from "next/image";
import { PRIMARY_PHONE, SHOP, SOCIAL_LINKS } from "@/config/shop";
import { Link } from "@/i18n/navigation";
import type { CategoryTile } from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { hoursMessageArgs } from "@/lib/contact/hours";
import { resolveHdcNav } from "@/lib/hdc-nav";
import { HUBS } from "@/lib/seo/hubs";
import { FooterCategories } from "@/components/chrome/FooterCategories";

/*
 * `prefetch={false}` on every link here: the footer is on every page, nobody
 * follows all of its links, and every prefetch is a full server render (the
 * pages answer `no-store`, they read the cart and locale from cookies).
 */

const PAYMENTS = ["VISA", "MASTERCARD", "IRIS"] as const;

/**
 * The platforms column: the platform hubs (/milwaukee-m12, …), then the two
 * technologies, which have no page of their own and open a search.
 */
const PLATFORMS = [
  { label: "M12", href: HUBS.m12.path },
  { label: "M18", href: HUBS.m18.path },
  { label: "MX FUEL", href: HUBS["mx-fuel"].path },
  { label: "PACKOUT", href: HUBS.packout.path },
  { label: "ONE-KEY™", href: `/anazitisi?q=${encodeURIComponent("ONE-KEY")}` },
  { label: "REDLITHIUM™", href: `/anazitisi?q=${encodeURIComponent("REDLITHIUM")}` },
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
      links: PLATFORMS.map((p) => ({ href: p.href, label: p.label })),
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
            {/* The HDC's own profiles (SHOP.social); brand names, not translated. */}
            <ul className="hdc-foot-social">
              {SOCIAL_LINKS.map((social) => (
                <li key={social.id}>
                  <a href={social.href} target="_blank" rel="noopener noreferrer">
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
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

        <FooterCategories />

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
