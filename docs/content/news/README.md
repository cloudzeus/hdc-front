# HDC news articles — drafts

Ten guide-style news articles for the Milwaukee Heavy Duty Centre blog, written for the
Greek market and translated into English and Italian. **None of them is published.** The
shop is not on its real domain yet, so they sit here as drafts and will be imported into
the blog at go-live.

## Where the blog content lives

The storefront does not own blog content. HDCtool does (`Post`, `PostTranslation` el/en/it,
`PostImage`), and the storefront reads it through the public blog endpoint
(`src/lib/blog/contract.ts`). Import at go-live therefore means: create one HDCtool `Post`
per folder, with one `PostTranslation` per language file, and paste the JSON-LD from
`schema.json` into the post's structured-data slot (or let the blog page emit it).

Until then nothing here is read by the application, and nothing was written to HDCtool or
to any database.

## Layout

```
docs/content/news/
  README.md
  <nn>-<greek-slug>/
    el.md         Greek (primary, written first)
    en.md         English
    it.md         Italian
    schema.json   JSON-LD @graph: Organization + BlogPosting ×3 (el/en/it) + FAQPage ×3
```

`<nn>` is the reading order (01–10). The folder name uses the Greek slug.

## Front matter (YAML), per language file

| field | meaning |
|---|---|
| `title` | H1 / on-page title |
| `seoTitle` | `<title>`, ≤ 60 characters |
| `metaDescription` | meta description, ≤ 155 characters (also the post's `shortDescription`) |
| `slug` | URL slug — Greeklish for `el`, English for `en` and `it` |
| `lang` | `el` \| `en` \| `it` |
| `translationKey` | the `<nn>` shared by the three languages (hreflang grouping) |
| `alternates` | the slug of the same article in each language |
| `status` | always `draft` in this folder |
| `date` | date written (ISO) |
| `author` | `Milwaukee Heavy Duty Centre` (Organization) |
| `keywords` | target search phrases, most important first |
| `entities` | named entities the article is about (for GEO/AEO) |
| `sources` | official Milwaukee pages every figure in the text was taken from |
| `faq` | `[{q, a}]` — the same Q&A as the "Συχνές ερωτήσεις" section; feeds FAQPage |
| `internalLinks` | `[{href, anchor}]` — every internal link used in the body |

The body is Markdown and starts with the **direct answer**: a 40–60-word paragraph that
answers the headline question on its own (for featured snippets and AI answers). Headings
(H2/H3) are phrased as the questions people search. Each article closes with a short local
section about the store in Piraeus.

## URLs

- Blog: `/blog/<slug>` (Greek), `/en/blog/<slug>`, `/it/blog/<slug>` — Greek has no locale
  prefix (`localePrefix: "as-needed"`, see `src/i18n/routing.ts`).
- Internal links are relative and use the same routing: `/katalogos/<slug>` and
  `/proion/<slug>` for Greek, `/en/...` and `/it/...` for the others. Category and product
  slugs are the same in all languages. Every slug was checked read-only against the
  hdc-front database on 2026-09-30; re-check before go-live, since products can be delisted
  or renamed (a rename leaves a redirect).
- `schema.json` uses the placeholder `{{SITE_URL}}` (no trailing slash) for absolute URLs;
  replace it with `NEXT_PUBLIC_SITE_URL` when importing. `datePublished` is set to the draft
  date and should be replaced with the real publication date.

## Editorial rules these drafts follow

- Facts only from the official Milwaukee Tool Europe site (milwaukeetool.eu), listed in
  `sources`. Figures are Milwaukee's own (often "up to", often from Milwaukee's internal
  tests) and are attributed as such. Anything that could not be verified was left out.
- Original prose. No Milwaukee marketing copy is reproduced or closely paraphrased.
- Store facts only from `src/config/shop.ts`: name, address, phone, hours, store pickup or
  delivery across Greece. No prices, stock levels, delivery promises, awards, or claims of
  being an authorised dealer/representative.
- Product availability is never promised in an article; the product page shows it
  («Σε απόθεμα», «Διαθέσιμο · 3–5 εργάσιμες», «Παράδοση 1–3 εργάσιμες»).

## Before publishing

1. Re-verify each internal link slug still exists and is listed.
2. Re-check figures against the `sources` pages (Milwaukee updates specs and ranges).
3. Replace `{{SITE_URL}}` and the dates in `schema.json`; set `status` in HDCtool.
4. Add a main image per post (HDCtool `PostImage`); none is included here.
