import type { Locale } from "@/i18n/routing";
import {
  SUPPLIER_HANDLING_DAYS,
  schemaOrgAvailability,
  type Availability,
} from "@/lib/catalog/availability";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { isValidGtin } from "@/lib/seo/gtin";
import { absoluteUrl } from "@/lib/seo/urls";

/**
 * Τα κομμάτια του Product schema που περιγράφουν ΓΕΓΟΝΟΤΑ, όχι την πώληση.
 *
 * ── Γιατί χωριστό αρχείο, και γιατί τώρα ────────────────────────────────────
 *
 * Το `Product` της σελίδας είχε όνομα, κωδικούς, εικόνα, μάρκα και προσφορά —
 * σωστά όλα, και τίποτα επινοημένο. Αυτό που έλειπε ήταν καθετί που κάνει μια
 * σελίδα ΠΑΡΑΘΕΣΙΜΗ: τα χαρακτηριστικά, το βάρος, η κατηγορία, οι όροι
 * αποστολής και επιστροφής.
 *
 * Η διαφορά μετράει διπλά:
 *
 *   · Στο Google, τα `shippingDetails` και `hasMerchantReturnPolicy` είναι αυτά
 *     που επιτρέπουν να εμφανιστούν μεταφορικά και επιστροφές μέσα στο
 *     αποτέλεσμα. Χωρίς αυτά το αποτέλεσμα δείχνει μόνο τιμή.
 *   · Στα AI chats, η πυκνότητα γεγονότων ΕΙΝΑΙ ο λόγος που παρατίθεται μια
 *     πηγή. Ένα μοντέλο που ρωτιέται «ποιο κατσαβίδι 25mm με 3 μύτες» δεν
 *     μπορεί να προτείνει σελίδα που δεν δηλώνει ούτε μήκος ούτε τεμάχια —
 *     ακόμα κι αν το κείμενο τα λέει, γιατί το κείμενο είναι πρόζα και αυτά
 *     είναι δεδομένα.
 *
 * Τα χαρακτηριστικά ΥΠΑΡΧΟΥΝ ήδη στη βάση, ανά γλώσσα, με μονάδα. Απλώς δεν
 * έβγαιναν ποτέ σε δομημένη μορφή.
 *
 * ── Τίποτα δεν επινοείται ───────────────────────────────────────────────────
 *
 * Κάθε τιμή εδώ προέρχεται από πραγματικό πεδίο ή από δηλωμένη πολιτική του
 * καταστήματος. Δεν υπάρχει `aggregateRating`: δεν υπάρχουν αξιολογήσεις, και
 * ένα schema που δηλώνει βαθμολογία που δεν συνέβη είναι ψέμα προς τη μηχανή
 * και ποινή όταν το καταλάβει.
 */

/** Ελληνικό δικαίωμα υπαναχώρησης — 14 ημερολογιακές ημέρες. */
const RETURN_DAYS = 14;

export type SpecRow = {
  label: string;
  value: string;
  unit: string | null;
};

/**
 * Τα χαρακτηριστικά ως `PropertyValue`.
 *
 * Η μονάδα μπαίνει στο `unitText` και ΟΧΙ κολλημένη στην τιμή: «25» με
 * `unitText: "mm"` είναι μετρήσιμο, το «25 mm» είναι συμβολοσειρά. Μηχανή που
 * συγκρίνει δύο προϊόντα μπορεί να κάνει το πρώτο, όχι το δεύτερο.
 *
 * Κενές τιμές παραλείπονται αντί να σταλούν άδειες — `PropertyValue` χωρίς
 * τιμή είναι ισχυρισμός ότι το προϊόν δεν έχει αυτό το χαρακτηριστικό.
 */
export function specsAsProperties(
  specs: SpecRow[],
  echo?: { brand?: string | null; category?: string | null },
) {
  /*
   * Πετάμε τα χαρακτηριστικά που απλώς επαναλαμβάνουν μάρκα ή κατηγορία.
   *
   * Πολλά είδη έχουν «χαρακτηριστικά» που είναι στην πραγματικότητα ταυτότητα:
   * Κατασκευαστής, Κατηγορία, Υποκατηγορία. Βρίσκονται ήδη στα `brand` και
   * `category` του schema, οπότε εδώ είναι θόρυβος — και θόρυβος που αραιώνει
   * ακριβώς το πράγμα για το οποίο υπάρχει το `additionalProperty`: τα
   * μετρήσιμα. Καλύτερα να μην υπάρχει block παρά block που δεν λέει τίποτα.
   */
  const echoes = new Set(
    [echo?.brand, echo?.category]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase()),
  );
  const rows = specs
    .filter((s) => s.label?.trim() && s.value?.trim())
    .filter((s) => !echoes.has(s.value.trim().toLowerCase()))
    .map((s) => ({
      "@type": "PropertyValue" as const,
      name: s.label.trim(),
      value: s.value.trim(),
      ...(s.unit?.trim() ? { unitText: s.unit.trim() } : {}),
    }));
  return rows.length > 0 ? rows : undefined;
}

/**
 * Οι όροι αποστολής, όπως τους εφαρμόζει πραγματικά το ταμείο.
 *
 * Το κατώφλι δωρεάν μεταφορικών διαβάζεται από την ΙΔΙΑ σταθερά που το
 * επιβάλλει (`FREE_SHIPPING_THRESHOLD_NET`), ώστε το schema να μην μπορεί να
 * υποσχεθεί όριο που το καλάθι δεν αναγνωρίζει.
 *
 * Ο χρόνος παράδοσης είναι εύρος και όχι μία τιμή: Αττική και νησιά δεν
 * παραδίδονται την ίδια μέρα, και ένα «1 εργάσιμη» θα ήταν σωστό για τον μισό
 * πληθυσμό και ψέμα για τον άλλον.
 */
export function shippingDetails(
  availability: Availability,
  options: {
    /** This product's own postage below the threshold, with VAT (ACS tariff). */
    postageGross?: number | null;
    /** The product's net price: above the threshold on its own, only the free rule applies. */
    priceNet?: number | null;
  } = {},
) {
  const supplier = availability === "supplier";
  const deliveryTime = {
    "@type": "ShippingDeliveryTime",
    // Παραγγελία πριν τις 15:00 φεύγει αυθημερόν — εκτός αν έρχεται από τον
    // προμηθευτή: τότε φεύγει σε 3–5 εργάσιμες (lib/catalog/availability.ts).
    handlingTime: {
      "@type": "QuantitativeValue",
      minValue: supplier ? SUPPLIER_HANDLING_DAYS.min : 0,
      maxValue: supplier ? SUPPLIER_HANDLING_DAYS.max : 1,
      unitCode: "DAY",
    },
    // Αττική 1 εργάσιμη · νησιά και δυσπρόσιτες έως 3.
    transitTime: {
      "@type": "QuantitativeValue",
      minValue: 1,
      maxValue: 3,
      unitCode: "DAY",
    },
  };
  const destination = { "@type": "DefinedRegion", addressCountry: "GR" };

  /* Δύο κανόνες, όπως τους εφαρμόζει το ταμείο: δωρεάν πάνω από το όριο
     (καθαρή αξία), και κάτω από αυτό το πραγματικό κόστος του δέματος. */
  const free = {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "EUR" },
    eligibleTransactionVolume: {
      "@type": "PriceSpecification",
      priceCurrency: "EUR",
      minPrice: FREE_SHIPPING_THRESHOLD_NET,
      valueAddedTaxIncluded: false,
    },
    shippingDestination: destination,
    deliveryTime,
  };
  const belowThreshold =
    options.postageGross != null &&
    options.postageGross > 0 &&
    (options.priceNet == null || options.priceNet < FREE_SHIPPING_THRESHOLD_NET);
  if (!belowThreshold) return [free];

  const paid = {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: options.postageGross!.toFixed(2), currency: "EUR" },
    eligibleTransactionVolume: {
      "@type": "PriceSpecification",
      priceCurrency: "EUR",
      maxPrice: FREE_SHIPPING_THRESHOLD_NET,
      valueAddedTaxIncluded: false,
    },
    shippingDestination: destination,
    deliveryTime,
  };
  return [free, paid];
}

/**
 * Η πολιτική επιστροφών — το θεσμικό δικαίωμα, δηλωμένο.
 *
 * 14 ημέρες υπαναχώρησης είναι ελληνικός νόμος για πωλήσεις εξ αποστάσεως, όχι
 * εμπορική παροχή. Δηλώνεται γιατί το Google το εμφανίζει δίπλα στην τιμή και
 * γιατί ένα μοντέλο που συγκρίνει καταστήματα το διαβάζει — απουσία εδώ
 * διαβάζεται ως «άγνωστη πολιτική», όχι ως «η προβλεπόμενη».
 */
export function returnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "GR",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnShippingFees",
  };
}

/**
 * Πότε παύει να ισχύει η τιμή που δηλώνουμε.
 *
 * Το Google θεωρεί προσφορά χωρίς `priceValidUntil` ως δυνητικά μπαγιάτικη και
 * μπορεί να πάψει να δείχνει την τιμή. Ένας χρόνος από σήμερα δεν είναι
 * αυθαίρετος: οι τιμές συγχρονίζονται από το ERP καθημερινά, οπότε η σελίδα
 * ποτέ δεν είναι πραγματικά τόσο παλιά — η ημερομηνία λέει «όχι εγκαταλελειμμένη»,
 * που είναι ακριβώς το ερώτημα.
 */
export function priceValidUntil(from: Date = new Date()): string {
  const until = new Date(from);
  until.setFullYear(until.getFullYear() + 1);
  return until.toISOString().slice(0, 10);
}

/** The first two steps of every trail, in the page's language. */
const CRUMB: Record<Locale, { home: string; catalogue: string }> = {
  el: { home: "Αρχική", catalogue: "Κατάλογος" },
  en: { home: "Home", catalogue: "Catalogue" },
  it: { home: "Home", catalogue: "Catalogo" },
};

/**
 * Η θέση του προϊόντος στον κατάλογο, ως διαδρομή.
 *
 * Το `BreadcrumbList` δεν είναι διακόσμηση στο αποτέλεσμα αναζήτησης: είναι ο
 * μόνος τρόπος που μια μηχανή μαθαίνει ότι το «ΜΥΤΕΣ SHOCKWAVE» ανήκει στα
 * «Αναλώσιμα» — και η ταξινομία είναι αυτό που ρωτάει ένα AI όταν του ζητούν
 * «τι κατσαβίδια έχει το κατάστημα».
 */
export function productBreadcrumb(
  locale: Locale,
  product: {
    name: string;
    slug: string;
    category?: { name: string; slug: string } | null;
    /** The whole path, category → group → subgroup; wins over `category`. */
    categories?: Array<{ name: string; slug: string }>;
  },
) {
  const items: Array<{ name: string; path: string }> = [
    { name: CRUMB[locale].home, path: "/" },
    { name: CRUMB[locale].catalogue, path: "/katalogos" },
  ];
  const chain = product.categories?.length
    ? product.categories
    : product.category
      ? [product.category]
      : [];
  for (const category of chain) {
    items.push({ name: category.name, path: `/katalogos/${category.slug}` });
  }
  items.push({ name: product.name, path: `/proion/${product.slug}` });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, locale),
    })),
  };
}

/**
 * Η κατηγορία ως λίστα προϊόντων.
 *
 * Μια σελίδα κατηγορίας χωρίς `ItemList` είναι, για μια μηχανή, ένα κείμενο με
 * συνδέσμους. Με αυτό γίνεται δηλωμένη συλλογή: «αυτή η σελίδα περιέχει αυτά τα
 * 24 προϊόντα, με αυτή τη σειρά». Είναι η διαφορά ανάμεσα στο να βρεθεί η
 * σελίδα και στο να παρατεθεί ως απάντηση στο «τι κατσαβίδια πουλάει το
 * κατάστημα».
 *
 * Μόνο URL και όνομα ανά θέση — όχι τιμές. Η τιμή ζει στη σελίδα προϊόντος με
 * τους όρους της (ΦΠΑ, μεταφορικά, διαθεσιμότητα)· αντιγραμμένη εδώ θα ήταν
 * δεύτερο αντίγραφο που μπορεί να παλιώσει χωριστά.
 *
 * Η θέση μετράει από 1 και ακολουθεί τη σειρά της σελίδας: αν κάποιος
 * ταξινομήσει κατά τιμή, αυτό δηλώνει τη σειρά που πραγματικά είδε.
 */
export function categoryItemList(
  locale: Locale,
  products: Array<{ slug: string; name: string }>,
  offset = 0,
) {
  if (products.length === 0) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: offset + i + 1,
      name: p.name,
      url: absoluteUrl(`/proion/${p.slug}`, locale),
    })),
  };
}

/**
 * Η διαδρομή μιας κατηγορίας.
 *
 * Ίδιο σκεπτικό με το `productBreadcrumb`, χωρίς το τελευταίο σκαλί.
 */
export function categoryBreadcrumb(
  locale: Locale,
  category: { name: string; slug: string; parent?: { name: string; slug: string } | null },
) {
  const items = [
    { name: CRUMB[locale].home, path: "/" },
    { name: CRUMB[locale].catalogue, path: "/katalogos" },
    ...(category.parent ? [{ name: category.parent.name, path: `/katalogos/${category.parent.slug}` }] : []),
    { name: category.name, path: `/katalogos/${category.slug}` },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, locale),
    })),
  };
}

export type ProductLdInput = {
  /** The page's own address. */
  url: string;
  origin: string;
  name: string;
  /** Our code (the SKU the page shows). */
  sku: string;
  /** Milwaukee article number. */
  code2: string | null;
  /** «M18 FPD3-502X», when the product is a model. */
  model: string | null;
  ean: string | null;
  images: string[];
  description?: string | null;
  category?: string | null;
  availability: Availability;
  /** The price the page shows and the cart charges, with VAT; null = not sold online. */
  priceGross: number | null;
  /** The price before a campaign discount, with VAT — only while one runs. */
  listPriceGross?: number | null;
  /** When the running campaign ends (ISO), if it does. */
  offerEndsAt?: string | null;
  priceNet?: number | null;
  postageGross?: number | null;
  specs?: Array<{ label: string; value: string }>;
  reviews?: Array<{ rating: number; title: string | null; body: string; author: string; date: string }>;
  /** Extra Product fields for a size of a family (`sizeFamilyLd().product`). */
  extra?: Record<string, unknown>;
};

/**
 * The product as structured data, agreeing with the page and the Merchant
 * feed: the price is the one the buy box shows (the campaign price while a
 * campaign runs, with the list price as a strikethrough), the identifiers are
 * the article number, model and a GTIN only when its check digit holds, the
 * seller is the store (`#shop`), and ratings exist only when real reviews do.
 */
export function productJsonLd(input: ProductLdInput) {
  const today = new Date();
  const ean = input.ean?.replace(/\D/g, "") ?? "";
  const gtin = isValidGtin(ean) ? (ean.length === 13 ? { gtin13: ean } : { gtin: ean }) : {};
  const discounted =
    input.priceGross != null && input.listPriceGross != null && input.listPriceGross > input.priceGross;
  const validUntil =
    discounted && input.offerEndsAt ? input.offerEndsAt.slice(0, 10) : priceValidUntil(today);

  const reviews = (input.reviews ?? []).filter((r) => r.rating >= 1 && r.rating <= 5);
  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${input.url}#product`,
    ...(input.extra ?? {}),
    name: input.name,
    sku: input.sku,
    ...(input.code2 ? { mpn: input.code2, productID: input.code2 } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...gtin,
    image: input.images,
    ...(input.description ? { description: input.description } : {}),
    brand: { "@type": "Brand", name: "Milwaukee" },
    ...(input.category ? { category: input.category } : {}),
    ...(input.priceGross != null
      ? {
          offers: {
            "@type": "Offer",
            url: input.url,
            price: input.priceGross.toFixed(2),
            priceCurrency: "EUR",
            ...(discounted
              ? {
                  priceSpecification: [
                    { "@type": "UnitPriceSpecification", price: input.priceGross.toFixed(2), priceCurrency: "EUR" },
                    {
                      "@type": "UnitPriceSpecification",
                      priceType: "https://schema.org/StrikethroughPrice",
                      price: input.listPriceGross!.toFixed(2),
                      priceCurrency: "EUR",
                    },
                  ],
                }
              : {}),
            priceValidUntil: validUntil,
            itemCondition: "https://schema.org/NewCondition",
            /*
             * The offer has to agree with the Merchant Center feed, which Google
             * reads this page to keep current — ours or the supplier's is
             * `InStock` (buyable), neither is `OutOfStock`.
             */
            availability: schemaOrgAvailability(input.availability),
            seller: { "@id": `${input.origin}/#shop` },
            shippingDetails: shippingDetails(input.availability, {
              postageGross: input.postageGross,
              priceNet: input.priceNet,
            }),
            hasMerchantReturnPolicy: returnPolicy(),
          },
        }
      : {}),
    ...(input.specs?.length
      ? { additionalProperty: input.specs.map((r) => ({ "@type": "PropertyValue", name: r.label, value: r.value })) }
      : {}),
    ...(average != null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: average.toFixed(1),
            reviewCount: reviews.length,
            bestRating: 5,
            worstRating: 1,
          },
          review: reviews.map((r) => ({
            "@type": "Review",
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            author: { "@type": "Person", name: r.author },
            datePublished: r.date.slice(0, 10),
            ...(r.title ? { name: r.title } : {}),
            reviewBody: r.body,
          })),
        }
      : {}),
  };
}

/**
 * A model page (/montelo/m18-fpd3) as a `ProductGroup`: the model, with each
 * version the store lists as a variant — its article number, model code, a
 * GTIN when valid, its page, and the price the page shows.
 */
export function modelGroupJsonLd(input: {
  url: string;
  origin: string;
  root: string;
  name: string;
  description: string | null;
  image: string | null;
  versions: Array<{
    url: string;
    name: string;
    code: string;
    code2: string;
    ean: string | null;
    image: string | null;
    priceGross: number | null;
    availability: Availability;
  }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${input.url}#model`,
    name: input.name,
    productGroupID: input.root,
    brand: { "@type": "Brand", name: "Milwaukee" },
    url: input.url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
    hasVariant: input.versions.map((v) => {
      const ean = v.ean?.replace(/\D/g, "") ?? "";
      return {
        "@type": "Product",
        "@id": `${v.url}#product`,
        name: v.name,
        sku: v.code2,
        mpn: v.code2,
        model: v.code,
        ...(isValidGtin(ean) ? (ean.length === 13 ? { gtin13: ean } : { gtin: ean }) : {}),
        url: v.url,
        ...(v.image ? { image: v.image } : {}),
        ...(v.priceGross != null
          ? {
              offers: {
                "@type": "Offer",
                url: v.url,
                price: v.priceGross.toFixed(2),
                priceCurrency: "EUR",
                availability: schemaOrgAvailability(v.availability),
                itemCondition: "https://schema.org/NewCondition",
                seller: { "@id": `${input.origin}/#shop` },
              },
            }
          : {}),
      };
    }),
  };
}
