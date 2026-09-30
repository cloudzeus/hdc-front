import "server-only";
import { prisma } from "@/lib/prisma";
import {
  AVAILABILITY_LABELS_EL,
  availabilityLabelKey,
  availabilityOf,
} from "@/lib/catalog/availability";
import { grossAmount, formatMoney } from "@/lib/format";
import { siteOrigin } from "@/lib/seo/urls";
import type { Locale } from "@/i18n/routing";
import { upGreek } from "@/lib/greek";
import { displayName, platformTag } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { renderEmail, localeUrl, type RenderedEmail } from "@/lib/mail/hdc/render";
import { t } from "@/lib/mail/hdc/strings";
import {
  DEFAULT_COPY,
  type CampaignPayload,
  type PickedProduct,
  type ProductFilters,
  type TemplateMeta,
} from "@/lib/newsletter/copy";
import { richText } from "@/lib/newsletter/rich-text";

/*
 * Επανεξαγωγή για τον server. Οι τιμές και οι τύποι ζουν στο `copy.ts`, που δεν
 * αγγίζει τίποτα του server — έτσι ο wizard τα εισάγει χωρίς να τραβά μαζί τους
 * τον renderer και το `node:fs`.
 */
export { DEFAULT_COPY };
export type {
  CampaignPayload,
  CampaignCopy,
  NewsArticle,
  NewsContent,
  PickedProduct,
  ProductFilters,
  TemplateMeta,
} from "@/lib/newsletter/copy";
export { EMPTY_NEWS } from "@/lib/newsletter/copy";

/**
 * Ό,τι χρειάζεται ο wizard από τον server: ποια πρότυπα υπάρχουν, ποια προϊόντα
 * μπορούν να μπουν σε καμπάνια, και πώς γίνεται όλο αυτό HTML.
 */


/**
 * The newsletters marketing can send, and only those: the transactional
 * emails are triggered by an order or an account and mean nothing as a mass
 * send. The same three the spec names — offers, new products, news — each
 * with product, banner, text and button blocks.
 *
 * `nl-announcement` (a Kolleris layout) is gone; a draft saved with it renders
 * with the news template, which takes the same content.
 */
const CAMPAIGN_TEMPLATES: TemplateMeta[] = [
  {
    id: "nl-offers",
    name: "Newsletter · Προσφορές",
    category: "newsletter",
    categoryTitle: "Newsletter",
    subject: "Προσφορές του μήνα στο Milwaukee Heavy Duty Centre",
    preheader: "Εργαλεία, μπαταρίες και PACKOUT σε τιμές προσφοράς, έως εξαντλήσεως.",
    takesProducts: true,
    takesRichText: true,
  },
  {
    id: "nl-new-products",
    name: "Newsletter · Νέα προϊόντα",
    category: "newsletter",
    categoryTitle: "Newsletter",
    subject: "Νέα προϊόντα Milwaukee στο κατάστημα",
    preheader: "Όσα μόλις έφτασαν στο Milwaukee Heavy Duty Centre Πειραιά.",
    takesProducts: true,
    takesRichText: true,
  },
  {
    id: "nl-news",
    name: "Newsletter · Νέα",
    category: "newsletter",
    categoryTitle: "Newsletter",
    subject: "Νέα από το Milwaukee Heavy Duty Centre",
    preheader: "Οδηγοί, νέα και ό,τι αλλάζει στο κατάστημα.",
    takesProducts: false,
    takesRichText: false,
  },
];

export function campaignTemplates(): TemplateMeta[] {
  return CAMPAIGN_TEMPLATES;
}

/**
 * Η διεύθυνση εικόνας, κωδικοποιημένη για email.
 *
 * ── Το πρόβλημα, μετρημένο ─────────────────────────────────────────────────
 *
 * 4.120 από τις 42.199 εικόνες του καταλόγου — ένα στα δέκα — έχουν ΚΕΝΑ στη
 * διεύθυνση, επειδή τα αρχεία της KNIPEX ονομάζονται «81 11 250_1.webp» όπως ο
 * κωδικός τους. Ο browser συγχωρεί· τα email όχι. Το `<img src="…/81 11
 * 250_1.webp">` δεν φορτώνει, και το επιβεβαίωσα και με αίτημα: με κενά
 * αποτυγχάνει, κωδικοποιημένο επιστρέφει 200.
 *
 * Το είδε ο πελάτης στο δοκιμαστικό email πριν το δω εγώ.
 *
 * Ο κατασκευαστής `URL` κωδικοποιεί μόνος του τη διαδρομή και είναι
 * ταυτοδύναμος: ένα ήδη κωδικοποιημένο «%20» δεν γίνεται «%2520».
 */
function emailSafeImageUrl(raw: string): string {
  if (!raw) return "";
  try {
    return new URL(raw).href;
  } catch {
    // Σχετική ή σπασμένη διεύθυνση: καλύτερα κενή παρά σίγουρα σπασμένη σε inbox.
    return "";
  }
}


/**
 * Αναζήτηση προϊόντων για τον επιλογέα.
 *
 * Μόνο ενεργά και ΜΟΝΟ με εικόνα: μια κάρτα προϊόντος χωρίς φωτογραφία σε
 * newsletter είναι κενό γκρι κουτί, και δεν υπάρχει τρόπος να σωθεί από το
 * layout. Καλύτερα να μη μπορεί να επιλεγεί παρά να φύγει έτσι.
 */

export async function searchCampaignProducts(
  filters: ProductFilters = {},
  limit = 24,
): Promise<PickedProduct[]> {
  const q = (filters.query ?? "").trim();
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      images: { some: {} },
      ...(filters.mtrmark != null ? { mtrmark: filters.mtrmark } : {}),
      /*
       * «Σε προσφορά» = υπάρχει `priceList` μεγαλύτερη της τιμής. ΟΧΙ το
       * `onSale` flag: εκείνο έχει σβήσει σκόπιμα από την προηγούμενη δουλειά
       * στις τιμές, όπου 68% του καταλόγου φαινόταν μόνιμα «σε προσφορά»
       * επειδή συγκρίναμε δύο τιμοκαταλόγους. Η διαγραμμένη τιμή είναι το μόνο
       * σημάδι που σημαίνει πραγματική έκπτωση.
       */
      ...(filters.onSaleOnly ? { priceList: { not: null } } : {}),
      ...(filters.inStockOnly ? { inStock: true } : {}),
      ...(q.length >= 2
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { code2: { contains: q, mode: "insensitive" } },
              { searchKey: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      code: true,
      code2: true,
      priceNet: true,
      priceList: true,
      qty: true,
      inStock: true,
      supplierAvailable: true,
      mtrmark: true,
      images: { orderBy: [{ isFeature: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
    },
    orderBy: q.length >= 2 ? { name: "asc" } : { firstListedAt: "desc" },
    take: limit,
  });

  /*
   * Η μάρκα δεν είναι σχέση πάνω στο Product — μόνο το `mtrmark` του ERP. Ένα
   * ερώτημα για όλες τις μάρκες της σελίδας, όχι ένα ανά προϊόν.
   */
  const marks = [...new Set(rows.map((r) => r.mtrmark).filter((m): m is number => m != null))];
  const brands = marks.length
    ? await prisma.brand.findMany({ where: { mtrmark: { in: marks } }, select: { mtrmark: true, nameEl: true } })
    : [];
  const brandByMark = new Map(brands.map((b) => [b.mtrmark, b.nameEl]));

  return rows.map((p) => {
    const net = p.priceNet ? Number(p.priceNet) : 0;
    const list = p.priceList ? Number(p.priceList) : 0;
    const gross = grossAmount(net);
    const grossOld = list > net ? grossAmount(list) : 0;
    const qty = p.qty ? Number(p.qty) : 0;
    const availability = availabilityLabelKey(availabilityOf(p), qty);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      code: p.code,
      code2: p.code2 || p.code,
      brand: (p.mtrmark != null ? brandByMark.get(p.mtrmark) : "") ?? "",
      image: emailSafeImageUrl(p.images[0]?.url ?? ""),
      price: formatMoney(gross, "el"),
      priceOld: grossOld > 0 ? formatMoney(grossOld, "el") : "",
      priceGross: gross,
      priceOldGross: grossOld > 0 ? grossOld : undefined,
      discount: grossOld > 0 ? String(Math.round((1 - gross / grossOld) * 100)) : "",
      /*
       * Frozen at the moment of sending: an email is a snapshot and does not
       * update when the stock changes. The storefront's rule: no number, except
       * the last piece.
       */
      stockLabel: AVAILABILITY_LABELS_EL[availability],
      availability,
      tag: platformTag(p.name) ?? (/\bPACKOUT\b/i.test(p.name) ? "PACKOUT" : null),
      bare: parseModel(p.name)?.content === "bare",
      url: `${siteOrigin()}/proion/${p.slug}`,
    };
  });
}

/** One product card of the grid, in the reader's language. */
function card(p: PickedProduct, locale: Locale, withDiscount: boolean) {
  const key = p.availability;
  return {
    tag: p.tag === undefined ? platformTag(p.name) : p.tag,
    pct: withDiscount && p.discount && Number(p.discount) > 0 ? p.discount : "",
    name: displayName(p.name, p.code2 ?? p.code),
    code: p.code2 || p.code,
    content: p.bare ? t(locale, "card.bare") : "",
    price: p.priceGross != null ? formatMoney(p.priceGross, locale) : p.price,
    was: withDiscount ? (p.priceOldGross ? formatMoney(p.priceOldGross, locale) : p.priceOld) : "",
    availability: key
      ? { label: t(locale, `avail.${key}`), tone: key === "se_apothema" || key === "teleftaio" ? "ok" : "wait" }
      : p.stockLabel
        ? { label: p.stockLabel, tone: /απόθεμα|τεμάχιο/i.test(p.stockLabel) ? "ok" : "wait" }
        : null,
    image: p.image,
    url: p.slug ? localeUrl(locale, `/proion/${p.slug}`) : p.url,
  };
}

/** The picked products in pairs: the grid is two cards wide. */
export function toProductRows(products: PickedProduct[], locale: Locale = "el", withDiscount = true) {
  const rows: Array<Array<ReturnType<typeof card>>> = [];
  for (let i = 0; i < products.length; i += 2) {
    rows.push(products.slice(i, i + 2).map((p) => card(p, locale, withDiscount)));
  }
  return rows;
}

const upper = (s: string, locale: Locale) => (locale === "el" ? upGreek(s) : s.toLocaleUpperCase(locale));

export type CampaignRenderOptions = {
  assetOrigin?: string;
  locale?: Locale;
  subject?: string;
  preheader?: string;
};

/**
 * The campaign as an email, for the preview or for sending.
 *
 * One path for both — a preview that lives on its own path shows something
 * that is not what leaves, which is worse than no preview.
 *
 * The editor writes the campaign in one language; the template's own words
 * (menu, card labels, availability, prices, footer) follow the subscriber's.
 */
export function renderCampaignEmail(
  templateId: string,
  payload: CampaignPayload,
  options: CampaignRenderOptions = {},
): RenderedEmail {
  const locale = options.locale ?? "el";
  const id = templateId === "nl-announcement" ? "nl-news" : templateId;
  const campaign = payload.campaign ?? { eyebrow: "", discount: "", title: "", text: "", url: "", valid_until: "" };

  /* An override counts only when somebody wrote something other than the default. */
  const copy = (key: keyof typeof DEFAULT_COPY, fallback: string) => {
    const value = payload.copy?.[key]?.trim();
    return value && value !== DEFAULT_COPY[key] ? value : fallback;
  };

  const subject = options.subject?.trim() || campaign.title || CAMPAIGN_TEMPLATES.find((x) => x.id === id)?.subject || "";
  const preheader = options.preheader?.trim() || campaign.text || "";
  const topline = {
    left: campaign.eyebrow || t(locale, "nl.topline_news"),
    right: new URL(siteOrigin()).host.replace(/^www\./, ""),
    href: localeUrl(locale, "/"),
  };

  let data: Record<string, unknown>;
  if (id === "nl-news") {
    const news = payload.news;
    const hero = news?.hero;
    data = {
      issue: news
        ? {
            label: [news.issue.label, news.issue.number].filter(Boolean).join(" · "),
            title: news.issue.title,
            intro: richText(news.issue.intro),
          }
        : {},
      hero: hero
        ? {
            badge: hero.eyebrow,
            title: [hero.title_before, hero.title_accent, hero.title_after].filter(Boolean).join(" ").trim(),
            text: richText(hero.text),
            image: hero.image,
            image_alt: hero.image_alt || hero.title_accent || "",
            cta: hero.url ? hero.cta || t(locale, "nl.read_more") : "",
            url: hero.url,
          }
        : {},
      articles: (news?.articles ?? []).map((a) => ({
        title: a.title,
        excerpt: richText(a.excerpt),
        tag: a.tag,
        image: a.image,
        url: a.url,
        cta: upper(a.cta || t(locale, "nl.read_more"), locale),
      })),
    };
  } else {
    const newProducts = id === "nl-new-products";
    const target = campaign.url || localeUrl(locale, newProducts ? "/nees-afixeis" : "/prosfores");
    data = {
      hero: {
        badge: campaign.eyebrow,
        big: newProducts ? "" : campaign.discount,
        title: campaign.title || (newProducts ? t(locale, "nl.new_section") : ""),
        text: campaign.text,
        image: campaign.image ?? "",
        image_alt: campaign.title,
        url: target,
      },
      intro: {
        title: copy("section_title", t(locale, newProducts ? "nl.new_section" : "nl.section_title")),
        paragraphs: [t(locale, "nl.delivery", { threshold: formatMoney(FREE_SHIPPING_THRESHOLD_NET, locale) })],
      },
      rows: toProductRows(payload.products ?? [], locale, !newProducts),
      cta: {
        label: upper(copy("all_button", t(locale, newProducts ? "nl.all_new" : "nl.all_offers")), locale),
        url: target,
        note: campaign.valid_until
          ? t(locale, "nl.prices_until", { date: campaign.valid_until })
          : t(locale, "nl.prices"),
      },
    };
  }

  return renderEmail({
    template: id,
    locale,
    kind: "newsletter",
    subject,
    preheader,
    topline,
    assetOrigin: options.assetOrigin,
    data,
  });
}

/** The campaign's HTML (preview, frozen copy of what was sent). */
export async function renderCampaign(
  templateId: string,
  payload: CampaignPayload,
  options: CampaignRenderOptions = {},
): Promise<string> {
  return renderCampaignEmail(templateId, payload, options).html;
}
