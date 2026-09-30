import Script from "next/script";
import { siteId } from "@/lib/seo/site-ids";
import { CONSENT_DEFAULT_SCRIPT } from "@/lib/analytics/consent";
import { analyticsEnabled } from "@/lib/analytics/enabled";

/**
 * Google Analytics 4, με Consent Mode v2.
 *
 * ── Η άρνηση είναι η προεπιλογή, και δεν είναι διακοσμητική ────────────────
 *
 * Το κατάστημα πουλά στην Ελλάδα. Το GA4 χωρίς συγκατάθεση γράφει cookie
 * ανάλυσης από το πρώτο δευτερόλεπτο, που είναι ακριβώς αυτό που απαγορεύει ο
 * ePrivacy. Με το Consent Mode ο επισκέπτης μετριέται ανώνυμα μέχρι να πει ναι:
 * το tag φορτώνει, στέλνει pings χωρίς αναγνωριστικά, και μόλις δοθεί η
 * συγκατάθεση αρχίζει η κανονική μέτρηση.
 *
 * Έτσι δεν χάνεται η κίνηση όσων δεν απαντούν, και δεν γράφεται τίποτα σε
 * κανέναν που δεν το ζήτησε.
 *
 * ── Γιατί `beforeInteractive` στο αρχικοποιητικό ──────────────────────────
 *
 * Η προεπιλογή συγκατάθεσης ΠΡΕΠΕΙ να μπει στο `dataLayer` πριν από κάθε
 * `config`. Με `afterInteractive` και στα δύο, η σειρά μεταξύ τους δεν είναι
 * εγγυημένη — και μια φορά που θα προλάβει το `config`, το cookie γράφεται
 * πριν ρωτηθεί κανείς.
 *
 * ── Δεν τρέχει σε ανάπτυξη ─────────────────────────────────────────────────
 *
 * Κάθε ανανέωση σε localhost θα μετριόταν ως επίσκεψη, και η κίνηση
 * προγραμματιστή μπαίνει στα ίδια σύνολα με τους πελάτες — αλλοιώνει ποσοστά
 * μετατροπής για πάντα, χωρίς να καθαρίζεται εκ των υστέρων.
 *
 * ── Το αναγνωριστικό ρυθμίζεται, χωρίς προεπιλογή ──────────────────────────
 *
 * Από το `NEXT_PUBLIC_GA_ID` και μόνο (βλ. `src/lib/seo/site-ids.ts`). Η
 * προεπιλογή που υπήρχε ήταν η ιδιοκτησία GA4 της Kolleris· χωρίς τιμή δεν
 * φορτώνει τίποτα.
 */


export function GoogleAnalytics() {
  /*
   * The consent default is needed by Tag Manager too: with GA4 moved into the
   * container and no direct id, the container would otherwise load with no
   * consent state at all. So it stays whenever either is on.
   */
  if (!analyticsEnabled()) return null;
  const MEASUREMENT_ID = siteId("gaId");

  /*
   * Η αποθηκευμένη απάντηση διαβάζεται ΜΕΣΑ στο inline script, όχι στον
   * διακομιστή: ο διακομιστής δεν ξέρει τι έχει ο browser, και μια
   * αποθηκευμένη σελίδα θα κουβαλούσε την απάντηση άλλου επισκέπτη.
   *
   * Το banner (`CookieConsent`) δεν μπαίνει εδώ αλλά στο layout του
   * καταστήματος, μέσα στις μεταφράσεις· το /admin δεν το χρειάζεται.
   */
  const init = `${CONSENT_DEFAULT_SCRIPT}
gtag('js', new Date());${
    MEASUREMENT_ID ? `\ngtag('config', ${JSON.stringify(MEASUREMENT_ID)});` : ""
  }`;

  return (
    <>
      <Script id="ga4-consent-init" strategy="beforeInteractive">
        {init}
      </Script>
      {MEASUREMENT_ID && (
        <Script
          id="ga4-src"
          src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
