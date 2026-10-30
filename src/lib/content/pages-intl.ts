/**
 * Which next-intl strings the admin can edit, grouped by the page they appear
 * on. Client-safe: definitions only, no values, no I/O.
 *
 * This is an allowlist. The save action writes a path only if it appears here,
 * so the editor can never touch a message outside the curated set — the whole
 * catalogue is not the admin's to rewrite, only the public-page copy that lives
 * in the `content` namespace.
 *
 * Each page is one accordion in the editor. `blurb` is written for the person
 * editing — it says where the text appears, so they can find it on the site
 * without being told which component renders it.
 */

export type IntlPage = {
  id: string;
  title: string;
  blurb: string;
  /** Dotted catalogue paths, in display order. */
  paths: string[];
};

export const INTL_PAGES: ReadonlyArray<IntlPage> = [
  {
    id: "oroi-chrisis",
    title: "Όροι χρήσης",
    blurb: "Σελίδα /oroi-chrisis — τίτλος και εισαγωγή. Το κυρίως κείμενο έρχεται από το HDCtool.",
    paths: ["content.t_oroi", "content.lead_oroi"],
  },
  {
    id: "aporrito",
    title: "Απόρρητο & cookies",
    blurb: "Σελίδα /aporrito — τίτλος, εισαγωγή και ο τίτλος της ενότητας cookies. Τα κείμενα πολιτικής έρχονται από το HDCtool.",
    paths: ["content.t_aporrito", "content.lead_aporrito", "content.t_cookies"],
  },
  {
    id: "epistrofes",
    title: "Επιστροφές",
    blurb: "Σελίδα /epistrofes — τίτλος και εισαγωγή. Το κυρίως κείμενο έρχεται από το HDCtool.",
    paths: ["content.t_epistrofes", "content.lead_epistrofes"],
  },
  {
    id: "apostoli-paradosi",
    title: "Αποστολή & παράδοση",
    blurb: "Σελίδα /apostoli-paradosi. Το {amount} στο μήνυμα courier αντικαθίσταται με το όριο δωρεάν μεταφορικών.",
    paths: [
      "content.t_apostoli",
      "content.lead_apostoli",
      "content.dorean_paralavi",
      "content.dorean_courier",
    ],
  },
  {
    id: "tropoi-pliromis",
    title: "Τρόποι πληρωμής",
    blurb: "Σελίδα /tropoi-pliromis — τίτλος και εισαγωγή.",
    paths: ["content.t_pliromi", "content.lead_pliromi"],
  },
  {
    id: "eggyiseis",
    title: "Εγγυήσεις",
    blurb: "Σελίδα /eggyiseis — τίτλος, εισαγωγή και οι παράγραφοι του κειμένου.",
    paths: [
      "content.t_eggyiseis",
      "content.lead_eggyiseis",
      "content.eggyisi_p1",
      "content.eggyisi_h_ypostirixi",
      "content.eggyisi_p2",
      "content.eggyisi_p3",
    ],
  },
  {
    id: "syxnes-erotiseis",
    title: "Συχνές ερωτήσεις",
    blurb: "Σελίδα /syxnes-erotiseis — τίτλος και εισαγωγή. Οι ερωτήσεις & απαντήσεις έρχονται από το HDCtool.",
    paths: ["content.t_faq", "content.lead_faq"],
  },
  {
    id: "epikoinonia",
    title: "Επικοινωνία",
    blurb: "Σελίδα /epikoinonia και η φόρμα επικοινωνίας.",
    paths: [
      "content.t_epikoinonia",
      "content.lead_epikoinonia",
      "content.grapste_mas",
      "content.grapste_mas_keimeno",
      "content.chreiazeste_voitheia",
      "content.voitheia_keimeno",
      "content.steilte_minyma",
      "content.erotisi_gia_proion",
    ],
  },
  {
    id: "etaireia",
    title: "Η εταιρεία",
    blurb: "Σελίδα /etaireia — τίτλος και εισαγωγή.",
    paths: ["content.t_etaireia", "content.lead_etaireia"],
  },
  {
    id: "stoixeia",
    title: "Στοιχεία & ωράριο",
    blurb: "Τηλέφωνα, email, διεύθυνση και ωράριο — εμφανίζονται στο header, το footer και τη σελίδα επικοινωνίας.",
    paths: [
      "content.tilefono",
      "content.tilefona",
      "content.email_paraggelies",
      "content.email_genika",
      "content.katastima",
      "content.dieythynsi",
      "content.odigies",
      "content.orario",
      "content.orario_syntomo",
      "content.orario_kathimerines",
      "content.orario_savvato",
      "content.orario_kyriaki",
      "content.anoichta_tora",
      "content.kleista",
      "content.kleista_anoigei_simera",
      "content.kleista_anoigei_ayrio",
      "content.kleista_anoigei_imera",
    ],
  },
  {
    id: "diafora",
    title: "Αναζήτηση & διάφορα",
    blurb: "Κοινά κείμενα: αρχική, αναζήτηση και σημειώσεις γλώσσας.",
    paths: [
      "content.archiki",
      "content.anazitisi_thema",
      "content.anazitisi_minyma",
      "content.mono_ellinika",
      "content.teleftaia_enimerosi",
      "content.syntoma",
    ],
  },
] as const;

/** The allowlist of dotted paths the save action will accept. */
export const EDITABLE_INTL_PATHS: ReadonlySet<string> = new Set(
  INTL_PAGES.flatMap((p) => p.paths),
);
