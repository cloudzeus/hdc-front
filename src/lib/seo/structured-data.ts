import { absoluteUrl, siteOrigin } from "@/lib/seo/urls";
import type { Locale } from "@/i18n/routing";
import { PRIMARY_PHONE, SHOP as CONFIG } from "@/config/shop";
import { openingHoursSpecification } from "@/lib/contact/hours";

/**
 * Structured data for the whole site.
 *
 * The product schema on the product page already tells a machine what one item
 * is. What was missing is what the *shop* is: who runs it, where it is, how to
 * search it. A search engine builds a knowledge panel from that, and a language
 * model answering "where can I buy Milwaukee tools in Piraeus" has nothing to
 * quote without it.
 *
 * Written from the same constants the pages use rather than restated, so the
 * phone number in a knowledge panel cannot drift from the one in the footer.
 */

/**
 * The shop, as machines read it. Derived from `SHOP` in src/config/shop.ts —
 * the same constants the footer prints — so the name and phone in a knowledge
 * panel cannot drift from the page.
 *
 * `name` is the shop (Milwaukee Heavy Duty Centre); `legalName` is the company
 * that operates it.
 */
export const SHOP = {
  name: CONFIG.name,
  legalName: CONFIG.operator.name,
  phone: PRIMARY_PHONE.e164,
  email: CONFIG.contact.email,
  street: CONFIG.contact.street,
  city: CONFIG.contact.city,
  postcode: CONFIG.contact.postcode,
  country: "GR",
  lat: 37.949726,
  lon: 23.642506,
  hours: CONFIG.contact.hours,
  /*
   * The operating company's founding year. Still read by `yearsInBusiness()`
   * for copy on pages not yet rewritten for the HDC; NOT published as the
   * shop's `foundingDate`, which would claim the HDC opened in 1978.
   */
  founded: "1978",
  /*
   * `sameAs` — the shop's own social profiles. Empty until the HDC has its
   * own: the Kolleris accounts are another business, and saying they are the
   * same entity would merge the two in a knowledge panel.
   */
  sameAs: [] as string[],
} as const;

/**
 * Organisation and site.
 *
 * `LocalBusiness` rather than plain `Organization`: there is a counter, an
 * address and opening hours, and "collect in two hours from Piraeus" is the
 * thing worth surfacing. A `SearchAction` lets a search engine offer the site's
 * own search box, and tells an agent the URL shape for a query rather than
 * leaving it to guess.
 */
export function siteJsonLd(locale: Locale) {
  const origin = siteOrigin();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HardwareStore",
        "@id": `${origin}/#shop`,
        name: SHOP.name,
        legalName: SHOP.legalName,
        url: absoluteUrl("/", locale),
        telephone: SHOP.phone,
        email: SHOP.email,
        ...(SHOP.sameAs.length ? { sameAs: SHOP.sameAs } : {}),
        priceRange: "€€",
        currenciesAccepted: "EUR",
        address: {
          "@type": "PostalAddress",
          streetAddress: SHOP.street,
          addressLocality: SHOP.city,
          postalCode: SHOP.postcode,
          addressCountry: SHOP.country,
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: SHOP.lat,
          longitude: SHOP.lon,
        },
        openingHoursSpecification: openingHoursSpecification(SHOP.hours),
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: absoluteUrl("/", locale),
        name: SHOP.name,
        publisher: { "@id": `${origin}/#shop` },
        inLanguage: locale,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${absoluteUrl("/anazitisi", locale)}?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/**
 * Μια σελίδα-λίστα, δηλωμένη ως λίστα.
 *
 * ── Τι έλειπε ──────────────────────────────────────────────────────────────
 *
 * Μετρημένο σε 16 σελίδες: μόνο η κατηγορία και το προϊόν είχαν δικό τους
 * structured data. Οι μάρκες, οι προσφορές, οι νέες αφίξεις, ο πλήρης
 * κατάλογος και το blog έδιναν μόνο το καθολικό `HardwareStore` + `WebSite` —
 * δηλαδή έλεγαν ποιο είναι το κατάστημα και τίποτα για το τι δείχνει η
 * σελίδα. Για μια μηχανή, «η σελίδα των μαρκών» ήταν κείμενο χωρίς δομή.
 *
 * ── Γιατί έχει σημασία πέρα από το SEO ─────────────────────────────────────
 *
 * Ένα γλωσσικό μοντέλο που ρωτιέται «ποιες μάρκες έχει ο Κολλέρης» πρέπει να
 * παραθέσει κάτι. Με `ItemList` παίρνει δεκαοκτώ ονόματα με τις διευθύνσεις
 * τους· χωρίς αυτό, μαντεύει από το κείμενο ή δεν απαντά.
 *
 * ── Θέσεις, όχι μόνο ονόματα ───────────────────────────────────────────────
 *
 * Το `position` δεν είναι διακοσμητικό: δηλώνει ότι η σειρά έχει νόημα — και
 * εδώ έχει, γιατί οι λίστες είναι ταξινομημένες κατά πλήθος κωδικών ή κατά
 * ημερομηνία. Χωρίς αυτό η λίστα διαβάζεται ως σύνολο χωρίς σειρά.
 */
export function collectionJsonLd(
  input: {
    name: string;
    description?: string;
    path: string;
    items: Array<{ name: string; path: string }>;
  },
  locale: Locale,
) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: absoluteUrl(input.path, locale),
    isPartOf: { "@id": `${siteOrigin()}/#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.items.length,
      itemListElement: input.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: absoluteUrl(item.path, locale),
      })),
    },
  };
}

/**
 * Μια σελίδα που ΛΕΕΙ κάτι, δηλωμένη ως τέτοια.
 *
 * `AboutPage` και `ContactPage` δεν είναι διακόσμηση: λένε σε μια μηχανή ότι
 * ΕΔΩ βρίσκεται η ταυτότητα και τα στοιχεία επικοινωνίας της επιχείρησης.
 * Χωρίς αυτά, ένα μοντέλο που ρωτιέται «πότε ιδρύθηκε ο Κολλέρης» ή «πού
 * είναι το κατάστημα» πρέπει να βγάλει άκρη από τρέχον κείμενο σελίδας.
 *
 * Το `mainEntity` δείχνει πίσω στο ίδιο `#shop` που δηλώνει το `siteJsonLd`,
 * αντί να ξαναγράφει τα στοιχεία: δύο αντίγραφα της διεύθυνσης αποκλίνουν την
 * πρώτη φορά που αλλάζει το ένα.
 */
export function infoPageJsonLd(
  type: "AboutPage" | "ContactPage",
  input: { name: string; description?: string; path: string },
  locale: Locale,
) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: absoluteUrl(input.path, locale),
    isPartOf: { "@id": `${siteOrigin()}/#website` },
    mainEntity: { "@id": `${siteOrigin()}/#shop` },
  };
}

/**
 * Το blog ως blog, και τα άρθρα του ως αναρτήσεις.
 *
 * Ένα `Blog` με `blogPost` δίνει σε μια μηχανή ημερομηνίες και τίτλους — δηλαδή
 * το ένα πράγμα που κάνει ένα άρθρο παραθέσιμο: πότε γράφτηκε. Χωρίς αυτό ένα
 * μοντέλο δεν ξεχωρίζει έναν οδηγό του 2026 από έναν του 2019.
 */
export function blogJsonLd(
  input: {
    name: string;
    description?: string;
    path: string;
    posts: Array<{
      title: string;
      path: string;
      publishedAt?: Date | string | null;
    }>;
  },
  locale: Locale,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: absoluteUrl(input.path, locale),
    isPartOf: { "@id": `${siteOrigin()}/#website` },
    publisher: { "@id": `${siteOrigin()}/#shop` },
    blogPost: input.posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: absoluteUrl(post.path, locale),
      ...(post.publishedAt
        ? {
            datePublished: new Date(post.publishedAt)
              .toISOString()
              .slice(0, 10),
          }
        : {}),
      publisher: { "@id": `${siteOrigin()}/#shop` },
    })),
  };
}

/**
 * Μια μάρκα ως οντότητα, και η σελίδα της ως λίστα των προϊόντων της.
 *
 * ── Γιατί `Brand` και όχι μόνο `CollectionPage` ────────────────────────────
 *
 * «BOSCH» είναι οντότητα που η μηχανή ήδη γνωρίζει. Το `Brand` με `sameAs`
 * προς τον επίσημο ιστότοπο του κατασκευαστή συνδέει ΑΥΤΗ τη σελίδα με ΕΚΕΙΝΗ
 * την οντότητα — αυτό είναι η διαφορά ανάμεσα στο «μια σελίδα που αναφέρει τη
 * λέξη Bosch» και «το κατάστημα με Bosch στον Πειραιά».
 */
export function brandPageJsonLd(
  input: {
    name: string;
    description?: string;
    slug: string;
    logo?: string | null;
    website?: string | null;
    products: Array<{ name: string; slug: string }>;
  },
  locale: Locale,
) {
  const path = `/brands/${input.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: absoluteUrl(path, locale),
    isPartOf: { "@id": `${siteOrigin()}/#website` },
    about: {
      "@type": "Brand",
      name: input.name,
      ...(input.logo ? { logo: input.logo } : {}),
      ...(input.website ? { sameAs: [input.website] } : {}),
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.products.length,
      itemListElement: input.products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: product.name,
        url: absoluteUrl(`/proion/${product.slug}`, locale),
      })),
    },
  };
}

/**
 * A trail a machine can follow.
 *
 * The storefront shows breadcrumbs as text; this is the same trail said in a
 * way a crawler uses to draw the path under a search result, instead of the
 * bare URL it falls back to.
 */
export function breadcrumbJsonLd(
  trail: Array<{ name: string; path: string }>,
  locale: Locale,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: absoluteUrl(step.path, locale),
    })),
  };
}

/**
 * Πόσα χρόνια δουλεύει η επιχείρηση, σήμερα.
 *
 * ── Γιατί δεν γράφεται νούμερο ─────────────────────────────────────────────
 *
 * Το κατάστημα έγραφε «46 χρόνια» σε οκτώ σημεία και σε τρεις γλώσσες —
 * αρχική, blog, σελίδα προϊόντος, επικοινωνία, εταιρεία, φίλτρα. Το 2026 ο
 * σωστός αριθμός είναι 48: το κείμενο γράφτηκε το 2024 και γέρασε σιωπηλά,
 * παντού ταυτόχρονα. Η επόμενη Πρωτοχρονιά θα το ξαναχαλούσε.
 *
 * Το `founded` είναι ήδη γραμμένο μία φορά, στο `SHOP`, και το διαβάζει και το
 * structured data — οπότε ο αριθμός που λέει η σελίδα και ο αριθμός που
 * διαβάζει η μηχανή δεν μπορούν πια να διαφωνήσουν.
 */
export function yearsInBusiness(now: Date = new Date()): number {
  return now.getFullYear() - Number(SHOP.founded);
}
