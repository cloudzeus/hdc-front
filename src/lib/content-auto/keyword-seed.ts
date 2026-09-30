/**
 * The clusters of docs/content/guides/keyword-map.md that were «seen in the
 * data but not written in this round», as the planner's KEYWORD seed.
 *
 * Copied here, not read from the file: docs/ is not in the server image. The
 * planner upserts them by key and never resets a DONE or SKIPPED one, so the
 * seed is imported once in effect. Priority is the map's reasoning («good
 * next-round guide» = M, the rest L); the category slugs are the catalogue's.
 */

export type KeywordSeed = {
  id: string;
  title: string;
  /** The primary query first, as people type it. */
  keywords: string[];
  priority: "H" | "M" | "L";
  /** Where the products (and the hero photo) come from, best first. */
  categorySlugs: string[];
  note: string;
};

export const KEYWORD_SEED: readonly KeywordSeed[] = [
  {
    id: "pistoli-thermou-aera",
    title: "Πιστόλι θερμού αέρα: πώς διαλέγω",
    keywords: ["πιστόλι θερμού αέρα", "πιστόλι θερμού αέρα μπαταρίας", "πιστολι θερμου αερα", "pistoli thermou aera"],
    priority: "M",
    categorySlugs: ["pistolia-thermou-aera-fysera-thermokollisis", "pistolia-thermou-aera-3"],
    note: "Πραγματική ζήτηση, λίγα προϊόντα· «good next-round guide» στο keyword map.",
  },
  {
    id: "koftes-solinon-preses",
    title: "Κόφτες σωλήνων και πρέσες σύνδεσης: πώς διαλέγω",
    keywords: ["κόφτης σωλήνων", "πρέσα υδραυλικών", "σωληνοκόφτης", "πρέσα σύνδεσης", "koftis solinon"],
    priority: "M",
    categorySlugs: ["preses-syndesis", "solinokoftes-chalkou", "solinokoftes-plastikou"],
    note: "Εξειδικευμένο, υπάρχει κατάλογος· «candidate next round» στο keyword map.",
  },
  {
    id: "koftis-kalodion",
    title: "Κόφτης καλωδίων μπαταρίας: πώς διαλέγω",
    keywords: ["κόφτης καλωδίων", "κόφτης καλωδίων μπαταρίας", "κοφτης καλωδιων milwaukee", "koftis kalodion"],
    priority: "M",
    categorySlugs: ["koftes-kalodion-domikon-ylikon", "koftes-kalodion-syrmatoschoinon"],
    note: "Εξειδικευμένο, υπάρχει κατάλογος· «candidate next round» στο keyword map.",
  },
  {
    id: "ergaleia-metrisis-charaxis",
    title: "Μετροταινία, αλφάδι, φαλτσέτα: εργαλεία μέτρησης και χάραξης",
    keywords: ["μετροταινία", "αλφάδι", "φαλτσέτα", "μετροταινία milwaukee", "metrotainia"],
    priority: "M",
    categorySlugs: ["metra-metrotainies-trochoi-metrisis", "alfadia-moirognomonia", "faltsetes", "charaxi"],
    note: "«Could form one guide next round» στο keyword map.",
  },
  {
    id: "sfyria",
    title: "Σφυριά: πώς διαλέγω",
    keywords: ["σφυρί", "σφυρί πένας", "σφυριά milwaukee", "sfyri"],
    priority: "L",
    categorySlugs: ["sfyria", "sfyria-penas"],
    note: "Από το ίδιο cluster εργαλείων χειρός του keyword map.",
  },
  {
    id: "planes-router",
    title: "Πλάνη και ρούτερ ξύλου: πώς διαλέγω",
    keywords: ["πλάνη ξύλου", "ρούτερ ξύλου", "πλάνη μπαταρίας", "plani xylou"],
    priority: "L",
    categorySlugs: ["planes-router-frezokavilieres-2", "planes-2", "router-3"],
    note: "Θορυβώδη αναζήτηση, μικρός κατάλογος.",
  },
  {
    id: "thermikes-kameres",
    title: "Θερμική κάμερα και θερμόμετρο laser: πώς διαλέγω",
    keywords: ["θερμική κάμερα", "θερμόμετρο laser", "θερμοκάμερα", "thermiki kamera"],
    priority: "L",
    categorySlugs: ["thermometra-laser-thermikes-kameres"],
    note: "Μικρός κατάλογος.",
  },
  {
    id: "ergaleia-kipou-mpatarias",
    title: "Εργαλεία κήπου μπαταρίας: πώς διαλέγω",
    keywords: ["εργαλεία κήπου μπαταρίας", "θαμνοκοπτικό μπαταρίας", "φυσητήρας μπαταρίας", "ergaleia kipou"],
    priority: "L",
    categorySlugs: ["ergaleia-kipou-batarias"],
    note: "Πρόθεση κήπου· ο κατάλογος είναι κυρίως αλυσοπρίονα.",
  },
  {
    id: "ekkinitis-gennitria",
    title: "Εκκινητής μπαταρίας και γεννήτρια: τι να ξέρετε",
    keywords: ["εκκινητής μπαταρίας", "γεννήτρια", "εκκινητης μπαταριας αυτοκινητου"],
    priority: "L",
    categorySlugs: ["ekkinites", "gennitries"],
    note: "Ένα προϊόν ανά κατηγορία.",
  },
] as const;
