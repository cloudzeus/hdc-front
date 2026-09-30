# HDC buying guides — drafts (Greek)

Thirty-five general buying guides («πώς διαλέγω …») for the Milwaukee Heavy Duty Centre
blog, written for the Greek market to cover the Greek search space for power tools,
accessories and PPE in Google and in AI answers (SEO / AEO / GEO). **Greek only in this
round. None of them is published.** They sit here as drafts, like `../news/`, and are
imported into HDCtool at go-live.

The research behind the topic list is in [`keyword-map.md`](keyword-map.md): Greek
autocomplete data, intent clusters, priorities, accented / unaccented / Greeklish variants,
and the clusters left for a later round.

## How these differ from `../news/`

The news articles are Milwaukee-centred (platforms, specific models, comparisons). The
guides are **general**: they answer the category question first («ποιο δράπανο να πάρω;»,
«τι σημαίνει S3;»), with correct, conservative general tool knowledge, and only then map the
criteria to Milwaukee in one section («Πώς ταιριάζει με τα Milwaukee;»). That keeps them
useful as answers for people who have not chosen a brand yet — the searches with the most
volume.

## Where the content lives

Same as the news drafts: the storefront does not own blog content. HDCtool does (`Post`,
`PostTranslation`, `PostImage`), and the storefront reads it through the public blog
endpoint (`src/lib/blog/contract.ts`). Import = one HDCtool `Post` per folder, one
`PostTranslation` (el), and the JSON-LD from `schema.json`. Nothing here is read by the
application, and nothing was written to HDCtool or to any database.

## Layout

```
docs/content/guides/
  README.md
  keyword-map.md
  <nn>-<greeklish-slug>/
    el.md         Greek guide (front matter + Markdown body)
    schema.json   JSON-LD @graph: Organization + BlogPosting + FAQPage (+ HowTo in 34)
```

## Front matter (YAML)

Same fields as `../news/README.md` (`title`, `seoTitle` ≤ 60, `metaDescription` ≤ 155,
`slug`, `lang`, `translationKey`, `alternates`, `status: draft`, `date`, `author`,
`keywords`, `entities`, `sources`, `faq`, `internalLinks`), plus:

| field | meaning |
|---|---|
| `translationKey` | `guide-<nn>`, so it never collides with the news keys `01`–`20` |
| `alternates` | only `el` for now; add `en` / `it` slugs when translated |
| `about` | the main topics; become `BlogPosting.about` (the rest of `entities` become `mentions`) |
| `howto` | only in guide 34 (a genuine step-by-step procedure); becomes a `HowTo` node |

## Body structure (every guide)

1. **Σύντομη απάντηση** — 40–60 words that answer the headline question on their own.
2. H2/H3 phrased as real Greek questions.
3. A comparison table (types / uses / what to look at) — general criteria.
4. **«Τι να κοιτάξεις»** — checklist.
5. «Ποια λάθη γίνονται συχνά;» and generic, responsible safety notes where relevant.
6. **«Πώς ταιριάζει με τα Milwaukee;»** — maps the criteria to M12 / M18 / MX FUEL /
   PACKOUT / accessory ranges, with internal links. Every Milwaukee figure is attributed
   («σύμφωνα με τη Milwaukee») and its page is in `sources`.
7. «Στο Milwaukee Heavy Duty Centre του Πειραιά» — NAP and opening hours only, from
   `src/config/shop.ts`.
8. «Συχνές ερωτήσεις» — 6 Q&A, identical to `faq` in the front matter (feeds `FAQPage`).

Voice: second person singular («διάλεξε», «κοίτα»), plain Greek, trade terms as Greek
tradespeople say them (πιστολέτο, σέγα, τροχός, καρυδάκια, γερμανοπολύγωνα).

## The guides

| # | Title (H1) | Slug | Words |
|---|---|---|---|
| 01 | Πώς διαλέγω δράπανο: δραπανοκατσάβιδο, κρουστικό ή πιστολέτο; | `pos-dialego-drapano` | 1170 |
| 02 | Δραπανοκατσάβιδο μπαταρίας: πώς διαλέγω το σωστό | `drapanokatsavido-mpatarias-pos-dialego` | 1126 |
| 03 | Πιστολέτο: SDS-Plus ή SDS-Max και πώς διαλέγω | `pistoleto-sds-plus-i-sds-max-pos-dialego` | 1064 |
| 04 | Παλμικό κατσαβίδι: πώς διαλέγω το σωστό | `palmiko-katsavidi-pos-dialego` | 1014 |
| 05 | Μπουλονόκλειδο: πώς διαλέγω για συνεργείο, μηχανήματα και φορτηγά | `boulonokleido-pos-dialego` | 1070 |
| 06 | Σέγα: πώς διαλέγω την κατάλληλη για ξύλο, μέταλλο και καμπύλες | `sega-pos-dialego` | 1029 |
| 07 | Σπαθόσεγα: πώς διαλέγω για κατεδάφιση, σωλήνες και κλάδεμα | `spathosega-pos-dialego` | 1033 |
| 08 | Δισκοπρίονο: πώς διαλέγω για ξύλο, μέταλλο και ίσιες κοπές | `diskopriono-pos-dialego` | 1023 |
| 09 | Φαλτσοπρίονο: πώς διαλέγω απλό, συρόμενο ή διπλής κλίσης | `faltsopriono-pos-dialego` | 1004 |
| 10 | Αλυσοπρίονο μπαταρίας: πώς διαλέγω μέγεθος λάμας και τύπο | `alysopriono-mpatarias-pos-dialego` | 1030 |
| 11 | Γωνιακός τροχός: 115, 125 ή 230 mm; Πώς διαλέγω | `goniakos-trochos-115-125-230` | 1020 |
| 12 | Τριβείο: έκκεντρο, παλμικό, δέλτα ή ταινιολειαντήρας; Πώς διαλέγω | `triveio-leiantiras-pos-dialego` | 1011 |
| 13 | Πολυεργαλείο (multi-tool): πώς διαλέγω παλμικό πολυεργαλείο | `polyergaleio-pos-dialego` | 1028 |
| 14 | Καρφωτικό μπαταρίας: πώς διαλέγω πλαισίων, φινιρίσματος ή καρφάκια | `karfotiko-mpatarias-pos-dialego` | 1029 |
| 15 | Πιστόλι σιλικόνης και χημικών: πώς διαλέγω χειρός ή μπαταρίας | `pistoli-silikonis-pos-dialego` | 1023 |
| 16 | Σκούπα εργοταξίου και σκούπα μπαταρίας: πώς διαλέγω κλάση και μέγεθος | `skoupa-ergotaxiou-mpatarias-pos-dialego` | 1004 |
| 17 | Φακοί και προβολείς εργοταξίου: πώς διαλέγω φωτισμό εργασίας | `fakoi-provoleis-ergotaxiou-pos-dialego` | 1018 |
| 18 | Αλφάδι laser: γραμμικό, 360° ή περιστροφικό; Πώς διαλέγω | `alfadi-laser-grammiko-i-peristrofiko` | 1017 |
| 19 | Μετρητής αποστάσεων laser: πώς διαλέγω και πώς λειτουργεί | `metritis-apostaseon-laser-pos-dialego` | 1003 |
| 20 | Ανιχνευτής τάσης, καλωδίων ή δέσμης laser: πώς διαλέγω | `anichneytis-tasis-kalodion-laser-pos-dialego` | 1016 |
| 21 | Κατσαβίδια και μύτες: Phillips, Pozidriv, Torx και πώς διαλέγω σετ | `katsavidia-kai-mytes-pos-dialego` | 1005 |
| 22 | Πένσες και τσιμπίδια: ποια χρειάζομαι και πώς διαλέγω | `penses-tsimpidia-pos-dialego` | 1005 |
| 23 | Γερμανοπολύγωνα, καρυδάκια και καστάνιες: πώς διαλέγω κλειδιά | `kleidia-karydakia-kastanies-pos-dialego` | 1006 |
| 24 | Εργαλειοθήκη: πώς διαλέγω πλαστική, υφασμάτινη, τροχήλατη ή εργαλειοφόρο | `ergaleiothiki-apothikeysi-pos-dialego` | 1008 |
| 25 | Τρυπάνια: πώς διαλέγω για ξύλο, μέταλλο, μπετό, πλακάκια και SDS | `trypania-pos-dialego` | 1006 |
| 26 | Δίσκοι κοπής και λείανσης: πώς διαλέγω για σίδηρο, inox, μπετό και πλακάκια | `diskoi-kopis-leiansis-pos-dialego` | 1012 |
| 27 | Λάμες σέγας και σπαθόσεγας: TPI, υλικό και πώς διαλέγω | `lames-segas-spathosegas-pos-dialego` | 1028 |
| 28 | ΜΑΠ: πώς διαλέγω γάντια, γυαλιά, ωτοασπίδες, κράνος και μάσκα | `map-gantia-gyalia-otoaspides-krani` | 1078 |
| 29 | Παπούτσια ασφαλείας: S1, S1P, S3 και πώς διαλέγω | `papoutsia-asfaleias-pos-dialego` | 1017 |
| 30 | Εργαλεία μπαταρίας ή ρεύματος; Τι να διαλέξω | `ergaleia-mpatarias-i-reymatos` | 1014 |
| 31 | Brushless ή με καρβουνάκια; Τι είναι ο κινητήρας brushless | `brushless-i-karvounakia` | 1006 |
| 32 | Πόσα Ah χρειάζομαι; Πώς διαλέγω μπαταρία εργαλείων | `posa-ah-mpataria-ergaleion` | 1010 |
| 33 | Τι σημαίνουν Nm, rpm, bpm, ipm και J στα εργαλεία; | `nm-rpm-bpm-joule-ti-simainoun` | 1011 |
| 34 | Πώς συντηρώ εργαλεία και μπαταρίες λιθίου: οδηγός βήμα βήμα | `syntirisi-ergaleion-mpatarias` | 1029 |
| 35 | Εργαλεία για αρχάριους και για επαγγελματίες: τι χρειάζομαι πρώτα | `ergaleia-gia-archarious-kai-epaggelmaties` | 1011 |

Word count = body words, excluding front matter, Markdown syntax and table rules (the same
number is in `BlogPosting.wordCount`).

## URLs and links

- Blog URL: `/blog/<slug>` (Greek has no locale prefix). `schema.json` uses `{{SITE_URL}}`
  (no trailing slash); replace it and `datePublished`/`dateModified` at import.
- Internal links are relative: `/katalogos/<slug>` and `/proion/<slug>`. Every slug was
  checked read-only against the hdc-front database on 2026-09-30: categories must exist
  and have `productCount > 0`, products must be active. Re-check before go-live.
- **Guide-to-guide links are not in the bodies yet**, because the blog slugs are not live.
  Several guides mention another guide in plain text («δες τον οδηγό μας για …»). At import,
  turn these into links:
  - 07 → 27 (λάμες), 11 → 26 (δίσκοι), 30 → 34 (συντήρηση), 33 → 32 (Ah)
  - suggested hub links: 01 ↔ 02 ↔ 03 ↔ 04 ↔ 05; 06 ↔ 07 ↔ 27; 08 ↔ 09; 11 ↔ 26;
    18 ↔ 19 ↔ 20; 21 ↔ 22 ↔ 23; 28 ↔ 29; 30 ↔ 31 ↔ 32 ↔ 33 ↔ 34; 35 → all.

## Overlap with the news drafts

Some guides share a topic with a Milwaukee-centred news article. They target different
intents (general "how to choose" vs. "which Milwaukee"), so both can live, but link them to
each other and keep the guide as the general answer:

| Guide | News article |
|---|---|
| 01, 02, 04 | 07 κρουστικό δραπανοκατσάβιδο ή παλμικό, 02 M12 ή M18 |
| 03, 25 | 10 SHOCKWAVE μύτες και τρυπάνια SDS |
| 11 | 08 γωνιακοί τροχοί M18 FUEL: ασφάλεια |
| 18 | 09 laser Milwaukee |
| 24 | 05 PACKOUT |
| 30, 32 | 01, 02, 03 (πλατφόρμες, μπαταρίες) |
| 28, 29, 33, 34 | the other writer's 17–19 (τεχνολογίες, μπαταρίες, ΜΑΠ) — check at import |

## Editorial rules these drafts follow

- General tool knowledge is conservative. Ranges are labelled «ενδεικτικά» / «περίπου»;
  standards are named only where they are well established (EN 166, EN ISO 20345, dust
  classes L/M/H, CAT categories, FFP2/FFP3).
- Milwaukee figures only from milwaukeetool.eu, attributed, and listed in `sources`.
- Original prose; no copying from Milwaukee or other sites.
- No prices, stock, quantities, delivery times or promises; no «εξουσιοδοτημένος» /
  «επίσημος αντιπρόσωπος» / dealer / distributor wording; no competitor names or claims.
- Safety statements generic and responsible (isolate circuits, PPE, follow the maker's
  manual; electrical work by licensed electricians).

## Validation

All 35 guides were checked with a script (not committed) for: `seoTitle` ≤ 60,
`metaDescription` ≤ 155, answer paragraph 40–60 words, body 1,000–1,800 words, required
sections present, 5–6 FAQ with exact parity between body, front matter and `FAQPage`, every
body link listed in `internalLinks` and vice versa, every slug present in the DB, banned
wording (dealer claims, prices, stock, delivery, competitor names), `sources` only on
milwaukeetool.eu. `schema.json` is generated from the front matter.

## Before publishing

1. Re-verify internal link slugs (products can be delisted or renamed).
2. Re-check Milwaukee figures against `sources`.
3. Replace `{{SITE_URL}}` and the dates in `schema.json`; set `status` in HDCtool.
4. Add the guide-to-guide links listed above.
5. Add a main image per guide (HDCtool `PostImage`).
6. Translate to en/it if wanted; add their slugs to `alternates`.
