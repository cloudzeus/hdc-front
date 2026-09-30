# Magento → hdc-front 301 map — report

Generated 2026-09-30T06:20:48.181Z by `scripts/seo/magento-redirects.ts`.

## How old URLs are resolved

The old milwaukeetoolshdc.gr is a headless storefront over Magento. Its product URLs end in the
SKU (`/mpataria-18v-5-0ah-m18-b5-4932430483`), which is our `code2`; its categories are
`/category-<id>-<name-slug>`. So `src/config/magento-redirects.json` maps every normalised code
(code2, code, code1; spaces/dashes stripped, case-insensitive; exact match only) to its product,
and every category name (old and new transliteration folded together) to its category.
Anything not found goes to `/anazitisi?q=<code or name>` — never a 404.

## Crawl

- robots.txt says `Disallow: /` for every agent: no sitemap was fetched.

## Coverage

| | matched | total | coverage |
|---|---:|---:|---:|
| Products (an old URL ending in its code2 resolves) | 2834 | 2864 | 99.0% |
| Categories with products (by name) | 252 | 333 | 75.7% |
| Observed old product URLs | 38 | 38 | 100.0% |
| Observed old category URLs | 6 | 6 | 100.0% |

Table size: 8457 codes, 242 category names.

## Observed old URLs (sample from the old home page)

| old | new | kind |
|---|---|---|
| `/about-us` | `/etaireia` | page |
| `/careers` | `/etaireia` | page |
| `/category-listing` | `/katalogos` | page |
| `/contact-us` | `/epikoinonia` | page |
| `/faqs` | `/syxnes-erotiseis` | page |
| `/new-products` | `/nees-afixeis` | page |
| `/payment-methods` | `/tropoi-pliromis` | page |
| `/popular-products` | `/proionta` | page |
| `/privacy-policy` | `/aporrito` | page |
| `/return-policy` | `/epistrofes` | page |
| `/reviews` | `/etaireia` | page |
| `/shipment-delivery` | `/apostoli-paradosi` | page |
| `/terms-and-conditions` | `/oroi-chrisis` | page |
| `/top-products` | `/proionta` | page |
| `/track-order` | `/logariasmos/entopismos` | page |
| `/category-10-ergaleia-cheiros` | `/katalogos/ergaleia-cheiros` | category |
| `/category-12-ergaleia-mpatarias` | `/katalogos/ergaleia-batarias` | category |
| `/category-18-metafora-apothikeysi-thesi-ergasias` | `/katalogos/metafora-apothikeysi-thesi-ergasias` | category |
| `/category-24-organa-metrisis-metrisi-charaxi` | `/katalogos/organa-metrisis-metrisi-charaxi` | category |
| `/category-28-mesa-atomikis-prostasias-odopoiia` | `/katalogos/mesa-atomikis-prostasias-odopoiia` | category |
| `/category-35-exartimata-ilektrikon-ergaleion-kai-mpatarias` | `/katalogos/exartimata-ilektrikon-ergaleion-kai-batarias` | category |
| `/alfadi-laser-aytorythm-no-m12-3pl-401c-4933478102` | `/proion/alfadi-laser-aytorythm-no-m12-3pl-401c-4933478102-4933478102` | product |
| `/amperotsimpida-600a-2235-40-4933427315` | `/proion/aberotsibida-600a-2235-40-4933427315-4933427315` | product |
| `/dimetro-synthetiko-ptyssomeno-4932459301` | `/proion/dimetro-synthetiko-ptyssomeno-4932459301-4932459301` | product |
| `/flextred-boa-s1ps-papoytsi-asfaleias-no-45-b1l110133-4932498089` | `/proion/flextred-boa-s1ps-papoutsi-asfaleias-no-45-b1l110133-4932498089-4932498089` | product |
| `/flextred-mpez-nubuck-s3s-mpotaki-asfaleias-no-45-1m171311-4932493749` | `/proion/flextred-bez-nubuck-s3s-botaki-asfaleias-no-45-1m171311-4932493749-4932493749` | product |
| `/flextred-mpez-nubuck-s3s-mpotaki-asfaleias-no-46-1m171311-4932493750` | `/proion/flextred-bez-nubuck-s3s-botaki-asfaleias-no-46-1m171311-4932493750-4932493750` | product |
| `/flextred-nubuck-boa-s3s-mpotaki-asfaleias-no-43-b1m110133-4932498126` | `/proion/flextred-nubuck-boa-s3s-botaki-asfaleias-no-43-b1m110133-4932498126-4932498126` | product |
| `/flextred-nubuck-boa-s3s-papoytsi-asfaleias-no-41-b1l110133-4932498111` | `/proion/flextred-nubuck-boa-s3s-papoutsi-asfaleias-no-41-b1l110133-4932498111-4932498111` | product |
| `/flextred-nubuck-boa-s3s-papoytsi-asfaleias-no-45b1l110133-4932498115` | `/proion/flextred-nubuck-boa-s3s-papoutsi-asfaleias-no-45b1l110133-4932498115-4932498115` | product |
| `/flextred-nubuck-boa-s3s-papoytsi-asfaleias-no-46-b1l110133-4932498116` | `/proion/flextred-nubuck-boa-s3s-papoutsi-asfaleias-no-46-b1l110133-4932498116-4932498116` | product |
| `/flextred-nubuck-s3s-papoytsi-asfaleias-no-44-1l110133-4932493722` | `/proion/flextred-nubuck-s3s-papoutsi-asfaleias-no-44-1l110133-4932493722-4932493722` | product |
| `/flextred-nubuck-s3s-papoytsi-asfaleias-no-45-1l110133-4932493723` | `/proion/flextred-nubuck-s3s-papoutsi-asfaleias-no-45-1l110133-4932493723-4932493723` | product |
| `/flextred-nubuck-s3s-papoytsi-asfaleias-no-46-1l110133-4932493724` | `/proion/flextred-nubuck-s3s-papoutsi-asfaleias-no-46-1l110133-4932493724-4932493724` | product |
| `/kasetina-karydakia-1-4-28tem-4932464943` | `/proion/kasetina-karydakia-1-4-28tem-4932464943-4932464943` | product |
| `/kasetina-karydakia-3-8-32tem-4932464945` | `/proion/kasetina-karydakia-3-8-32tem-4932464945-4932464945` | product |
| `/katsabidi-karydaki-magnitiko-8mm-hallowcore-48222535` | `/proion/katsavidi-karydaki-magnitiko-8mm-hallowcore-48222535-48222535` | product |
| `/laser-aytorythmizomeno-comp-m12-3plkit-401-p-4933478960` | `/proion/laser-aytorythmizomeno-comp-m12-3plkit-401-p-4933478960-4933478960` | product |
| `/laser-m12-cll4p-301c-4933479203` | `/proion/laser-m12-cll4p-301c-4933479203-4933479203` | product |
| `/machairi-6-se-1-fastback-4932478559` | `/proion/machairi-6-se-1-fastback-4932478559-4932478559` | product |
| `/markadoros-mayros-leptis-mytis-48223100` | `/proion/markadoros-mayros-leptis-mytis-48223100-48223100` | product |
| `/markadoros-me-mpilia-mayros-48223731` | `/proion/markadoros-me-bilia-mayros-48223731-48223731` | product |
| `/mpataria-18v-5-0ah-m18-b5-4932430483` | `/proion/bataria-18v-5-0ah-m18-b5-4932430483-4932430483` | product |
| `/mpataria-li-ion-m12b2-2-0ah-4932430064` | `/proion/bataria-li-ion-m12b2-2-0ah-4932430064-4932430064` | product |
| `/mpataria-li-ion-m12b4-4ah-4932430065` | `/proion/bataria-li-ion-m12b4-4ah-4932430065-4932430065` | product |
| `/mpataria-li-ion-m12b6-6ah-4932451395` | `/proion/bataria-li-ion-m12b6-6ah-4932451395-4932451395` | product |
| `/mpataries-18v-2-ah-4932430062` | `/proion/bataries-18v-2-ah-4932430062-4932430062` | product |
| `/mytes-adaptor-set-32-tem-shockwave-drive-4932464240` | `/proion/mytes-adaptor-set-32-tem-shockwave-drive-4932464240-4932464240` | product |
| `/mytes-shockwave-ph-2x50mm-set-10-tem-4932430855` | `/proion/mytes-shockwave-ph-2x50mm-set-10-tem-4932430855-4932430855` | product |
| `/potirotrypano-m14-diamond-max-5mm-4932471758` | `/proion/potirotrypano-m14-diamond-max-5mm-4932471758-4932471758` | product |
| `/potirotrypano-m14-diamond-max-6mm-4932471759` | `/proion/potirotrypano-m14-diamond-max-6mm-4932471759-4932471759` | product |
| `/potirotrypano-m14-diamond-max-8mm-4932471760` | `/proion/potirotrypano-m14-diamond-max-8mm-4932471760-4932471760` | product |
| `/set-mpataries-fortistis-m12-nrg-202-4933459209` | `/proion/set-bataries-fortistis-m12-nrg-202-4933459209-4933459209` | product |
| `/set-mpataries-fortistis-m18-nrg-503-4933451423` | `/proion/set-bataries-fortistis-m18-nrg-503-4933451423-4933451423` | product |
| `/skyla-pensa-250mm-kampyloti-4932471725` | `/proion/skyla-pensa-250mm-kabyloti-4932471725-4932471725` | product |
| `/tileskopikos-solinokaboyras-24-48227314` | `/proion/tileskopikos-solinokavouras-24-48227314-48227314` | product |
| `/trigono-maragkoy-michanoyrgoy-4932472124` | `/proion/trigono-maragkou-michanourgou-4932472124-4932472124` | product |
| `/usb-grammiko-laser-l4-cllp-301c-4933478099` | `/proion/usb-grammiko-laser-l4-cllp-301c-4933478099-4933478099` | product |
| `/usb-laser-2-grammon-l4-cll-301c-4933478098` | `/proion/usb-laser-2-grammon-l4-cll-301c-4933478098-4933478098` | product |

## Not matched

### Products whose code2 does not resolve (30)

Each code below belongs to two ERP products; the old URL goes to the search for the code, which lists both.

- `4932399889` (potirotrypano-hss-kovaltiou-f210-milwaukee-4932399889) — an old URL ending in this code goes to the search
- `48228120` (zoni-ergolavou-me-imantes-48228120-48228120) — an old URL ending in this code goes to the search
- `4932498086` (flextred-boa-s1ps-papoutsi-asfaleias-no-42-b1l110133-4932498086-milwaukee-4932498086) — an old URL ending in this code goes to the search
- `4932352038` (trypani-sds-plus-14ch310mm-4932352038-milwaukee-4932352038) — an old URL ending in this code goes to the search
- `4932493104` (kapelo-bcpdgr-dark-grey-l-xl-4932493104-4932493104) — an old URL ending in this code goes to the search
- `4932493104` (kapelo-bcpdgr-dark-grey-l-xl-4932493104-milwaukee-4932493104) — an old URL ending in this code goes to the search
- `4932498086` (flextred-boa-s1ps-papoutsi-asfaleias-no-42-b1l110133-4932498086-4932498086) — an old URL ending in this code goes to the search
- `4932399243` (proektasi-sds-max-1100-mm-4932399243-milwaukee-4932399243) — an old URL ending in this code goes to the search
- `4933478293` (spathosega-m18-fsz-0x-fuel-4933478293-4933478293) — an old URL ending in this code goes to the search
- `4933459433 ` (fakos-ergasias-m18-ubl-0-solo-ip56-4933459433-milwaukee-4933459433) — an old URL ending in this code goes to the search
- `4932480712` (packout-vasi-apothikeysis-trypanion-mw-4932480712) — an old URL ending in this code goes to the search
- `4932493473` (packout-koupa-thermos-kokkini-530ml-4932493473-4932493473) — an old URL ending in this code goes to the search
- `4932471927` (packout-troley-gia-thiki-afros-4932471927-4932471927) — an old URL ending in this code goes to the search
- `4932498978` (packout-koupa-thermos-mayri-355ml-4932498978-4932498978) — an old URL ending in this code goes to the search
- `4932493473` (packout-koupa-thermos-kokkini-530ml-mw-4932493473) — an old URL ending in this code goes to the search
- `4932498978` (packout-koupa-thermos-mayri-355ml-4932498978-milwaukee-4932498978) — an old URL ending in this code goes to the search
- `4932471927` (afros-vasi-gia-packout-4932471927-milwaukee-4932471927) — an old URL ending in this code goes to the search
- `4932480712` (vasi-packout-apothikeysis-trypanion-4932480712-4932480712) — an old URL ending in this code goes to the search
- `4933459433` (epanafortizomenos-fakos-m18-ubl-0-4933459433-4933459433) — an old URL ending in this code goes to the search
- `48228120` (zoni-ergolavou-me-imantes-48228120-4932500306-milwaukee-48228120) — an old URL ending in this code goes to the search
- `4932399889` (potirotrypano-hss-kovaltiou-f210-4932399889-milwaukee-4932399889) — an old URL ending in this code goes to the search
- `4932399243` (proektasi-sds-max-1100mm-4932399243-4932399243) — an old URL ending in this code goes to the search
- `4932498382` (set-42tmch-1-4-ger-na-karydakia-kastania-mytes-4932498382-milwaukee-4932498382) — an old URL ending in this code goes to the search
- `4932498382` (set-42-tmch-1-4-karydakia-germanopolygona-kastanias-mytes-4932498382-milwaukee-4932498382) — an old URL ending in this code goes to the search
- `4933459885` (spathosega-m18-fhz-502x-fuel-4933459885-milwaukee-4933459885) — an old URL ending in this code goes to the search
- `4933478293` (spathosega-m18-fsz-0x-fuel-4933478293-milwaukee-4933478293) — an old URL ending in this code goes to the search
- `4933459885` (spathosega-m18-fiz-502x-fuel-4933459885-4933459885) — an old URL ending in this code goes to the search
- `4932352038` (trypani-sds-plus-14x310mm-4kopon-4932352038-milwaukee-4932352038) — an old URL ending in this code goes to the search
- `4932471107` (trypani-pollaplon-ylikon-10x120mm-4932471107-4932471107) — an old URL ending in this code goes to the search
- `4932471107` (trypani-pollaplon-ylikon-10x120-4932471107-milwaukee-4932471107) — an old URL ending in this code goes to the search

### Ambiguous codes left out (43)

`0045242368082`, `045242333943`, `4002395002641`, `4002395003037`, `4002395163984`, `4002395289943`, `4002395308859`, `4002395358540`, `4002395365432`, `4002395366958`, `4002395385560`, `4058546010942`, `4058546030575`, `4058546287351`, `4058546295370`, `4058546298265`, `4058546344702`, `4058546347543`, `4058546370220`, `4058546376215`, `4058546405960`, `4058546409975`, `4058546410766`, `4058546479756`, `4058546483449`, `4058546512460`, `4058546521530`, `4058546524289`, `48228120`, `4932352038`, `4932399243`, `4932399889`, `4932471107`, `4932471927`, `4932480712`, `4932493104`, `4932493473`, `4932498086`, `4932498382`, `4932498978`, `4933459433`, `4933459885`, `4933478293`

### Categories with products whose name is shared at the same level (81)

An old link with one of these names goes to the search for the name: the old URL carries only the
leaf name and a Magento id, and the Magento-id → PIM mapping lives in HDCtool (MagentoCategoryMapping),
not in this database.

- ΜΠΟΥΛΟΝΟΚΛΕΙΔΑ 1/2" (`boulonokleida-1-2-2`, subgroup)
- ΠΟΤΗΡΟΚΟΡΩΝΕΣ (`potirokorones`, subgroup)
- ΓΩΝΙΑΚΟΙ ΤΡΟΧΟΙ - ΛΕΙΑΝΤΗΡΕΣ ΜΠΕΤΟΥ ΦΡΕΖΕΣ (`goniakoi-trochoi-leiantires-betou-frezes-2`, group)
- ΑΛΟΙΦΑΔΟΡΟΙ - ΣΑΤΙΝΙΕΡΕΣ - ΕΥΘΕΙΣ ΛΕΙΑΝΤΗΡΕΣ (`aloifadoroi-satinieres-eytheis-leiantires`, group)
- ΑΛΟΙΦΑΔΟΡΟΙ - ΣΑΤΙΝΙΕΡΕΣ - ΕΥΘΕΙΣ ΛΕΙΑΝΤΗΡΕΣ (`aloifadoroi-satinieres-eytheis-leiantires-2`, group)
- ΓΩΝΙΑΚΟΙ ΤΡΟΧΟΙ - ΛΕΙΑΝΤΗΡΕΣ ΜΠΕΤΟΥ - ΦΡΕΖΕΣ (`goniakoi-trochoi-leiantires-betou-frezes`, group)
- ΚΑΣΤΑΝΙΕΣ (`kastanies-3`, subgroup)
- ΔΙΣΚΟΠΡΙΟΝΑ ΧΕΙΡΟΣ (`diskopriona-cheiros`, group)
- ΔΙΣΚΟΠΡΙΟΝΑ ΧΕΙΡΟΣ (`diskopriona-cheiros-2`, group)
- ΑΛΟΙΦΑΔΟΡΟΙ (`aloifadoroi`, subgroup)
- ΑΛΟΙΦΑΔΟΡΟΙ (`aloifadoroi-2`, subgroup)
- ΑΞΕΣΟΥΑΡ - ΑΝΤΑΛΛΑΚΤΙΚΑ (`axesouar-antallaktika`, subgroup)
- ΑΞΕΣΟΥΑΡ - ΑΝΤΑΛΛΑΚΤΙΚΑ (`axesouar-antallaktika-2`, subgroup)
- ΓΩΝΙΑΚΟΙ ΤΡΟΧΟΙ Φ125 (`goniakoi-trochoi-f125`, subgroup)
- ΓΩΝΙΑΚΟΙ ΤΡΟΧΟΙ Φ125 (`goniakoi-trochoi-f125-2`, subgroup)
- ΓΩΝΙΑΚΟΙ ΤΡΟΧΟΙ Φ230 (`goniakoi-trochoi-f230`, subgroup)
- ΓΩΝΙΑΚΟΙ ΤΡΟΧΟΙ Φ230 (`goniakoi-trochoi-f230-2`, subgroup)
- ΕΚΚΕΝΤΡΑ ΤΡΙΒΕΙΑ Φ125 (`ekkentra-triveia-f125`, subgroup)
- ΕΚΚΕΝΤΡΑ ΤΡΙΒΕΙΑ Φ125 (`ekkentra-triveia-f125-2`, subgroup)
- ΠΕΡΙΣΤΡΟΦΙΚΑ -  ΣΚΑΠΤΙΚΑ ΠΙΣΤΟΛΕΤΑ (`peristrofika-skaptika-pistoleta`, group)
- ΠΕΡΙΣΤΡΟΦΙΚΑ - ΣΚΑΠΤΙΚΑ ΠΙΣΤΟΛΕΤΑ (`peristrofika-skaptika-pistoleta-2`, group)
- ΣΕΓΕΣ - ΣΠΑΘΟΣΕΓΕΣ - ΑΛΕΠΟΟΥΡΕΣ (`seges-spathoseges-alepooures`, group)
- ΣΕΓΕΣ - ΣΠΑΘΟΣΕΓΕΣ - ΑΛΕΠΟΟΥΡΕΣ (`seges-spathoseges-alepooures-2`, group)
- ΣΕΤ (`set`, group)
- ΣΕΤ (`set-2`, group)
- ΚΑΛΕΜΙΣΜΑ (`kalemisma`, subgroup)
- ΚΑΛΕΜΙΣΜΑ (`kalemisma-2`, subgroup)
- ΣΤΑΘΕΡΑ ΜΗΧΑΝΗΜΑΤΑ (`stathera-michanimata`, group)
- ΣΤΑΘΕΡΑ ΜΗΧΑΝΗΜΑΤΑ (`stathera-michanimata-2`, group)
- ΤΡΙΒΕΙΑ - ΤΑΙΝΙΟΛΕΙΑΝΤΗΡΕΣ (`triveia-tainioleiantires`, group)
- ΤΡΙΒΕΙΑ - ΤΑΙΝΙΟΛΕΙΑΝΤΗΡΕΣ (`triveia-tainioleiantires-2`, group)
- ΚΑΣΤΑΝΙΕΣ (`kastanies`, subgroup)
- ΚΑΣΤΑΝΙΕΣ (`kastanies-2`, subgroup)
- ΚΑΣΤΑΝΙΕΣ (`kastanies-6`, subgroup)
- ΚΡΟΥΣΤΙΚΑ ΔΡΑΠΑΝΑ (`kroustika-drapana`, subgroup)
- ΛΑΜΕΣ ΜΕΤΑΛΛΟΥ (`lames-metallou`, subgroup)
- ΛΑΜΕΣ ΜΕΤΑΛΛΟΥ (`lames-metallou-2`, subgroup)
- ΛΑΜΕΣ ΞΥΛΟΥ (`lames-xylou`, subgroup)
- ΛΑΜΕΣ ΞΥΛΟΥ (`lames-xylou-2`, subgroup)
- ΛΟΙΠΑ (`loipa-2`, subgroup)
- ΛΟΙΠΑ (`loipa-7`, subgroup)
- ΛΟΙΠΑ (`loipa-9`, subgroup)
- ΛΟΙΠΑ (`loipa-11`, subgroup)
- ΛΟΙΠΕΣ ΛΑΜΕΣ (`loipes-lames`, subgroup)
- ΛΟΙΠΕΣ ΛΑΜΕΣ (`loipes-lames-2`, subgroup)
- ΜΕΤΑΛΛΟΥ (`metallou-2`, subgroup)
- ΜΕΤΑΛΛΟΥ (`metallou-3`, subgroup)
- ΜΠΟΥΛΟΝΟΚΛΕΙΔΑ 3/4" (`boulonokleida-3-4`, subgroup)
- ΜΠΟΥΛΟΝΟΚΛΕΙΔΑ 3/4" (`boulonokleida-3-4-2`, subgroup)
- ΞΥΛΟΥ - ΑΛΟΥΜΙΝΙΟΥ (`xylou-alouminiou`, subgroup)
- ΞΥΛΟΥ - ΑΛΟΥΜΙΝΙΟΥ (`xylou-alouminiou-2`, subgroup)
- ΜΠΟΥΛΟΝΟΚΛΕΙΔΑ 1/2" (`boulonokleida-1-2-3`, subgroup)
- ΠΕΡΙΣΤΡΟΦΙΚΑ ΔΡΑΠΑΝΑ (`peristrofika-drapana-2`, subgroup)
- ΠΕΡΙΣΤΡΟΦΙΚΑ ΔΡΑΠΑΝΑ (`peristrofika-drapana`, subgroup)
- ΠΡΟΒΟΛΕΙΣ - ΣΥΝΕΡΓΕΙΟΥ (`provoleis-synergeiou`, subgroup)
- ΠΡΟΒΟΛΕΙΣ ΣΥΝΕΡΓΕΙΟΥ (`provoleis-synergeiou-2`, subgroup)
- ΠΡΟΕΚΤΑΣΕΙΣ (`proektaseis-3`, subgroup)
- ΠΡΟΕΚΤΑΣΕΙΣ (`proektaseis-4`, subgroup)
- ΣΕΙΡΑ IMPACT (`seira-impact`, subgroup)
- ΠΟΤΗΡΟΚΟΡΩΝΕΣ (`potirokorones-2`, subgroup)
- ΣΕΙΡΑ IMPACT (`seira-impact-3`, subgroup)
- ΣΕΤ (`set-3`, subgroup)
- ΣΕΤ ΜΕ ΔΥΟ ΕΡΓΑΛΕΙΑ (`set-me-dyo-ergaleia`, subgroup)
- ΣΕΤ ΜΕ ΔΥΟ ΕΡΓΑΛΕΙΑ (`set-me-dyo-ergaleia-2`, subgroup)
- ΣΕΤ ΜΕ ΚΑΡΥΔΑΚΙΑ ΚΑΙ ΚΑΣΤΑΝΙΑ ΜΕΤΡΙΚΟ (`set-me-karydakia-kai-kastania-metriko`, subgroup)
- ΣΕΤ ΜΕ ΚΑΡΥΔΑΚΙΑ ΚΑΙ ΚΑΣΤΑΝΙΑ ΜΕΤΡΙΚΟ (`set-me-karydakia-kai-kastania-metriko-2`, subgroup)
- ΣΕΤ ΜΕ ΚΑΡΥΔΑΚΙΑ ΜΟΝΟ (`set-me-karydakia-mono`, subgroup)
- Φ125 (`f125`, subgroup)
- Φ125 (`f125-2`, subgroup)
- Φ125 (`f125-4`, subgroup)
- Φ125 (`f125-6`, subgroup)
- ΦΑΚΟΙ ΚΕΦΑΛΗΣ (`fakoi-kefalis`, subgroup)
- ΦΑΚΟΙ ΚΕΦΑΛΗΣ (`fakoi-kefalis-2`, subgroup)
- ΦΑΚΟΙ ΧΕΙΡΟΣ (`fakoi-cheiros`, subgroup)
- ΦΑΚΟΙ ΧΕΙΡΟΣ (`fakoi-cheiros-2`, subgroup)
- ΚΡΟΥΣΤΙΚΑ ΔΡΑΠΑΝΑ (`kroustika-drapana-2`, subgroup)
- ΛΟΙΠΕΣ ΜΑΡΚΕΣ (`loipes-markes`, subgroup)
- ΛΟΙΠΕΣ ΜΑΡΚΕΣ (`loipes-markes-2`, subgroup)
- ΣΕΤ ΜΕ ΚΑΡΥΔΑΚΙΑ ΜΟΝΟ (`set-me-karydakia-mono-4`, subgroup)
- ΤΡΥΠΗΜΑ (`trypima`, subgroup)
- ΤΡΥΠΗΜΑ (`trypima-2`, subgroup)

## Uncertain

- The old site's full URL list could not be read (robots.txt `Disallow: /`); coverage is measured
  from our catalogue and from the URLs linked on its home page.
- Old category names are matched by name. A Magento category whose name differs from every
  category here falls back to the search for its name.
- Page aliases other than those linked from the old site (see `MAGENTO_PAGES`) are common
  Magento/PWA names, not observed ones.
