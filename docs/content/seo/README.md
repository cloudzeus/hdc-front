# SEO / GEO / AEO copy — drafts (Greek only)

Copy for the landing pages and category pages that plan 8
(`docs/superpowers/plans/2026-09-30-plan-8-seo-geo.md`) adds. Nothing here is read by the
application yet, and nothing was written to HDCtool or to any database. The files are the
content source; plan 8 decides how they are loaded (bundled at build time, or imported into
a content table).

**Language.** Greek only. On 2026-09-30 the owner decided that SEO/GEO/AEO targets the
Greek market, so there are no `en`/`it` versions. Pages in `/en` and `/it` should fall back
to their existing generic copy (or omit the intro) rather than show Greek.

## Layout

```
docs/content/seo/
  README.md
  platforms/<key>/el.md        hub pages (plan 8 Task 8)
  categories/<slug>.json       category intro + FAQ (plan 8 Task 11)
```

## Platform hubs — `platforms/<key>/el.md` (plan 8 Task 8)

| key | route | H1 |
|---|---|---|
| `milwaukee` | `/milwaukee` | Εργαλεία Milwaukee (brand hub; `/brands/milwaukee` 301s here) |
| `m18` | `/milwaukee-m18` | Milwaukee M18: εργαλεία μπαταρίας 18V |
| `m12` | `/milwaukee-m12` | Milwaukee M12: υπο-compact εργαλεία μπαταρίας 12V |
| `mx-fuel` | `/mx-fuel` | Milwaukee MX FUEL: ελαφρύς εξοπλισμός εργοταξίου με μπαταρία |
| `packout` | `/packout` | Milwaukee PACKOUT: αρθρωτό σύστημα αποθήκευσης |

Front matter (YAML):

| field | meaning |
|---|---|
| `key`, `route` | which page this is and where it renders |
| `lang`, `status`, `date` | always `el`, `draft`, date written |
| `h1` | the page H1 |
| `seoTitle` | `<title>`, ≤ 60 characters |
| `metaDescription` | ≤ 155 characters |
| `keywords` | target phrases, including colloquial and accent-less variants people type |
| `entities` | named entities (for `about`/`mentions` in JSON-LD and for GEO) |
| `sources` | official Milwaukee pages every figure was taken from |
| `faq` | `[{q, a}]`, 6–8 items, identical to the «Συχνές ερωτήσεις» section; feeds `FAQPage` |
| `internalLinks` | every internal link in the body (`/katalogos/<slug>`, `/proion/<slug>`, or another hub route) |
| `relatedArticles` | Greek blog slugs to link once those posts are published (round 1 and round 2) |

Body (Markdown): a 40–60-word answer-first intro paragraph (no heading, the H1 comes from
front matter), 5 H2 sections phrased as Greek search questions, a «Στο κατάστημα του
Πειραιά» paragraph with name, address, phone and hours only, and «Συχνές ερωτήσεις» with
the FAQ as `###` question + one-paragraph answer. 700–1000 words.

How plan 8 uses it: render the intro under the H1, then the page's own dynamic blocks
(main categories, popular models, batteries and chargers), then the H2 sections, the store
paragraph and the FAQ, and emit `FAQPage` from `faq`. Links between hubs point at the new
routes, which exist only after Task 8.

## Category intros — `categories/<slug>.json` (plan 8 Task 11)

30 files, one per category. Chosen from the hdc-front database (read-only, 2026-09-30) by
product count and importance: the top-level categories and the big groups/subgroups
(drills, impact drivers, impact wrenches, SDS hammers, grinders, saws, batteries, chargers,
lasers, PACKOUT/toolboxes, hand tools, bits, blades, hole saws, PPE, gloves, lighting,
vacuums, 18V kits).

```json
{
  "slug": "kroustika-drapana-2",
  "route": "/katalogos/kroustika-drapana-2",
  "erpType": "SUBGROUP",
  "parent": "drapana-katsavidieres-boulonokleida-kastanies",
  "name": "ΚΡΟΥΣΤΙΚΑ ΔΡΑΠΑΝΑ",
  "status": "draft",
  "date": "2026-09-30",
  "el": {
    "h1": "…",
    "seoTitle": "… Milwaukee …",
    "metaDescription": "…",
    "intro": "…",
    "keywords": ["…"],
    "faq": [{ "q": "…", "a": "…" }],
    "relatedCategories": ["…"]
  },
  "sources": ["https://www.milwaukeetool.eu/…"]
}
```

- `slug` is the `Category.slug` (the file name too). `erpType`, `parent` and `name` are
  copied from the database for orientation only; the page should keep reading them live.
- `seoTitle` ≤ 60, sentence case with accents (never the ERP's capitals), always contains
  «Milwaukee» and the platform where it fits. `metaDescription` ≤ 155.
- `intro` 60–120 words, answer-first: what the category is, then how to choose, naming the
  platforms (M12/M18/MX FUEL) where relevant.
- `faq` 4–5 items → `categoryFaq` + `FAQPage` JSON-LD.
- `relatedCategories` are category slugs with products (checked 2026-09-30).
- `keywords` are the search phrases the copy targets (including colloquial/accent-less
  forms); not rendered.

How plan 8 uses it (`katalogos/[kathgoria]/page.tsx`): look up the file by slug; if found,
use `seoTitle`/`metaDescription` for metadata, render `h1` and `intro` above the grid
(`categoryIntro`) and the FAQ below it (`categoryFaq`) with `FAQPage`. Categories without a
file keep the generated title and no intro.

## Editorial rules (both sets)

- Facts only from official Milwaukee pages (milwaukeetool.eu en-eu / it-it), listed in
  `sources`, attributed in the text («σύμφωνα με τη Milwaukee», «κατά τη Milwaukee»).
  Store advice is labelled as advice. No Milwaukee copy reproduced.
- Store facts only from `src/config/shop.ts`. No prices, stock, quantities, delivery
  promises, awards, or claims of being an authorised dealer, representative or
  distributor.
- Internal links only to slugs that exist: every `/katalogos/` slug has products and every
  `/proion/` slug is an active product, checked read-only against the hdc-front database on
  2026-09-30. Re-check before go-live.

## Before go-live

1. Re-verify link slugs and re-check figures against `sources` (Milwaukee updates pages).
2. For `/proion/` links whose catalogue article number differs from the one on the
   Milwaukee page (a newer version of the same model), keep the text on the model, not the
   article number.
