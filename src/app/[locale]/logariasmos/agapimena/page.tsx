import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { HdcProductCard } from "@/components/product/HdcProductCard";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { prisma } from "@/lib/prisma";
import { getAccountShellData } from "@/lib/account/dashboard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.Hdc" });
  return { title: t("meta_favourites"), robots: { index: false, follow: false } };
}

/**
 * Αποθηκευμένα προϊόντα.
 *
 * Η ίδια `ProductCard` με τον κατάλογο, όχι δική της λίστα. Ο πελάτης έρχεται
 * εδώ για να αγοράσει, και θέλει ό,τι ακριβώς είχε όταν αποθήκευσε: τιμή,
 * απόθεμα, «Στο καλάθι», «Αγορά τώρα». Μια στριμωγμένη σειρά με όνομα και ένα
 * κουμπί θα τον ανάγκαζε να ανοίξει το προϊόν για να δει αν αξίζει ακόμη.
 *
 * Και οι τιμές είναι ΖΩΝΤΑΝΕΣ, όχι όπως τη μέρα της αποθήκευσης: το αγαπημένο
 * κρατά ποιο προϊόν, όχι πόσο έκανε.
 */
export default async function FavouritesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account.Hdc");
  const { user } = await requireCustomer(locale, "/logariasmos/agapimena");
  const shell = await getAccountShellData(user);

  const rows = await prisma.favourite.findMany({
    where: { customerId: user.id, product: { isActive: true } },
    orderBy: { createdAt: "desc" },
    select: {
      product: {
        select: {
          id: true,
          mtrl: true,
          slug: true,
          name: true,
          code: true,
          code2: true,
          mtrmark: true,
          mtrcategory: true,
          priceNet: true,
          priceList: true,
          vatRate: true,
          qty: true,
          inStock: true,
          variantGroup: true,
          images: {
            where: { isFeature: true },
            take: 1,
            select: { url: true },
          },
          translations: { select: { locale: true, name: true } },
          sizes: {
            select: { label: true },
            orderBy: { order: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  const brandRows = await prisma.brand.findMany({
    where: {
      mtrmark: {
        in: rows
          .map((r) => r.product.mtrmark)
          .filter((m): m is number => m != null),
      },
    },
    select: {
      mtrmark: true,
      slug: true,
      nameEl: true,
      nameEn: true,
      nameIt: true,
    },
  });
  const brands = new Map(
    brandRows.map((b) => [
      b.mtrmark!,
      {
        slug: b.slug,
        name:
          locale === "en" ? b.nameEn : locale === "it" ? b.nameIt : b.nameEl,
      },
    ]),
  );

  const products = rows.map(({ product: p }) => {
    const brand = p.mtrmark != null ? brands.get(p.mtrmark) : undefined;
    const translated = p.translations.find((t) => t.locale === locale)?.name;
    return {
      id: p.id,
      mtrl: p.mtrl,
      slug: p.slug,
      name: translated?.trim() || p.name,
      sku: p.code || p.code2,
      brandName: brand?.name ?? null,
      brandSlug: brand?.slug ?? null,
      image: p.images[0]?.url ?? null,
      priceNet: p.priceNet == null ? null : Number(p.priceNet),
      priceListNet: p.priceList == null ? null : Number(p.priceList),
      vatRate: p.vatRate == null ? 24 : Number(p.vatRate),
      qty: p.qty == null ? 0 : Number(p.qty),
      inStock: p.inStock,
    };
  });

  return (
    <AccountChrome locale={locale}>
      <AccountShell shell={shell} active="/logariasmos/agapimena" title={t("nav_favourites")}>
        {products.length === 0 ? (
          /* An empty screen with a way out, not an apology: nobody did anything
             wrong by not having saved anything yet. */
          <section className="hdc-box">
            <h2 className="hdc-disp">{t("nav_favourites")}</h2>
            <div className="hdc-empty">
              <p>{t("fav_empty")}</p>
              <p>{t("fav_empty_body")}</p>
              <Link href="/katalogos" className="hdc-btn hdc-btn-red">
                {t("ston_katalogo")}
              </Link>
            </div>
          </section>
        ) : (
          <>
            <p className="hdc-lead">{t("fav_lead", { count: products.length })}</p>
            <div className="hdc-fav-grid">
              {products.map((product) => (
                <HdcProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </AccountShell>
    </AccountChrome>
  );
}
