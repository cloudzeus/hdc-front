# Google ids and the site address — Coolify settings

The shop carries no Google id in its source (no Kolleris defaults). Each one is
read from the environment by `src/lib/seo/site-ids.ts`; an unset, blank or
malformed value means that tag, script or feed is simply left out.

## Set as BOTH a build variable AND a runtime variable

`NEXT_PUBLIC_*` values are baked into the JavaScript and into pages prerendered
during `next build`, and the server also reads them at runtime. In Coolify tick
**"Build Variable"** on each of these (the Dockerfile declares them as `ARG`s)
and keep them as normal environment variables too:

| Variable | What | Example |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | The canonical address; canonicals, sitemap, JSON-LD, feeds, 301 host fold | `https://milwaukeetoolshdc.gr` |
| `NEXT_PUBLIC_GSC_VERIFICATION` | Search Console HTML-tag token (also claims the site for Merchant Center) | `AbC…xyz` |
| `NEXT_PUBLIC_MERCHANT_ID` | Merchant Center account, for the Customer Reviews opt-in | `123456789` |
| `NEXT_PUBLIC_GA_ID` | GA4 measurement id (leave empty if GA4 lives inside GTM) | `G-XXXXXXXXXX` |
| `NEXT_PUBLIC_GTM_ID` | Tag Manager container (to be provided) | `GTM-XXXXXXX` |

A change to any of them needs a **rebuild**, not only a restart.

## Runtime only

| Variable | What |
|---|---|
| `LOCAL_INVENTORY_STORE_CODE` | The store code exactly as the Business Profile has it. Without it `/feeds/local-inventory.txt` answers 404. |
| `SITE_INDEXING` | `on` only at go-live; until then every page is `noindex` and robots.txt disallows all. |

## No longer read

Remove these if the app was cloned from the Kolleris one — they carry Kolleris
values and are ignored on purpose: `GOOGLE_SITE_VERIFICATION`,
`NEXT_PUBLIC_GOOGLE_MERCHANT_ID`, `GOOGLE_LOCAL_STORE_CODE`,
`NEXT_PUBLIC_GA_MEASUREMENT_ID`.

GA4 and GTM load only in production builds, after the Consent Mode v2 default.
The banner asks for two categories: statistics (`analytics_storage`) and
advertising (`ad_storage`, `ad_user_data`, `ad_personalization`); both are
denied until the visitor accepts. The answer is kept in localStorage under
`hdc-consent-v2` for twelve months, and the footer's cookie-settings link
reopens the panel. Every change pushes `{event: 'consent_update', analytics, ads}`
to the dataLayer for GTM triggers.
