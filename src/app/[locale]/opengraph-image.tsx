import { ImageResponse } from "next/og";
import { SHOP } from "@/config/shop";

/**
 * Η εικόνα που βλέπει κανείς όταν κάποιος στέλνει ένα link του καταστήματος.
 *
 * ── Τι υπήρχε πριν ─────────────────────────────────────────────────────────
 *
 * Τίποτα. Μετρημένο σε έξι σελίδες: ούτε ένα `og:*`, ούτε ένα `twitter:*`.
 * Ένα link του eshop επικολλημένο σε Viber, Messenger, Slack ή LinkedIn
 * εμφανιζόταν ως γυμνή διεύθυνση — χωρίς τίτλο, χωρίς περιγραφή, χωρίς εικόνα.
 * Το `<title>` και το `description` ήταν σωστά· απλώς δεν τα διαβάζει κανένας
 * scraper, γιατί οι scrapers διαβάζουν Open Graph.
 *
 * ── Γιατί παράγεται και δεν είναι αρχείο ───────────────────────────────────
 *
 * Ένα PNG στο `public/` γίνεται λάθος τη μέρα που αλλάζει το λογότυπο ή το
 * σύνθημα, και κανείς δεν το θυμάται γιατί δεν φαίνεται πουθενά στη σελίδα.
 * Εδώ χτίζεται από τα ίδια χρώματα και το ίδιο σήμα με το κατάστημα.
 *
 * ── Χωρίς `next/font` ──────────────────────────────────────────────────────
 *
 * Το `ImageResponse` τρέχει σε δικό του περιβάλλον και δεν βλέπει τα CSS
 * variables της σελίδας· θέλει τα ίδια τα bytes της γραμματοσειράς. Χωρίς
 * αυτά αποδίδει σε system sans, που για 1200×630 σε λευκά κεφαλαία είναι
 * αρκετά κοντά — και σαφώς καλύτερο από το να μην υπάρχει καθόλου εικόνα.
 */
export const alt = `${SHOP.name} — Milwaukee M12, M18, MX FUEL & PACKOUT`;

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

/* The HDC palette (src/styles/hdc/tokens.css): Milwaukee red on ink. */
const RED = "#DB011C";
const INK = "#0A0A0A";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: INK,
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              backgroundColor: RED,
              color: "#FFFFFF",
              fontSize: 44,
              fontWeight: 900,
              padding: "10px 22px",
              letterSpacing: "-0.01em",
            }}
          >
            MILWAUKEE
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: "-0.01em",
              color: "#FFFFFF",
            }}
          >
            HEAVY DUTY CENTRE
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: 80,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              color: "#FFFFFF",
            }}
          >
            M12 · M18 · MX FUEL · PACKOUT
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.72)" }}>
            {`Όλη η γκάμα Milwaukee — ${SHOP.contact.city}.`}
          </div>
        </div>

        <div style={{ display: "flex", height: 10, backgroundColor: RED, width: 260 }} />
      </div>
    ),
    size,
  );
}
