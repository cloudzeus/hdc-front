import "server-only";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import type { Locale } from "@/i18n/routing";
import { PRIMARY_PHONE, SHOP, SOCIAL_LINKS } from "@/config/shop";
import { siteOrigin } from "@/lib/seo/urls";
import { upGreek } from "@/lib/greek";
import { fill, rawString, t, type AnyKey } from "@/lib/mail/hdc/strings";
import { mailImageUrl, isMailImageWidth } from "@/lib/mail/hdc/image";
import { htmlToText } from "@/lib/mail/hdc/text";

/**
 * The HDC emails: Handlebars templates in `src/emails/hdc/`, rendered here.
 *
 * ── Why no separate build step ─────────────────────────────────────────────
 *
 * The spec asks for partials «flattened» into self-contained HTML with inline
 * CSS. The partials are written with their styles already inline (the approved
 * mockups are), so flattening is only partial resolution, which Handlebars does
 * at render time. The one design-token pass (`$RED`, `$FONT` …) runs when a
 * file is first read. A build step would add a generated copy of every file to
 * keep in sync and change nothing in what leaves: the output is the same
 * self-contained HTML, with the one <style> block that cannot be inlined
 * (mobile and dark-mode media queries).
 *
 * A private Handlebars environment, so these partials and helpers cannot clash
 * with anything else that uses Handlebars.
 */

export type MailKind = "newsletter" | "order" | "account" | "subscribe" | "internal" | "admin";

/** HDC design tokens (src/styles/hdc/tokens.css), for the `$NAME` pass. */
const TOKENS: Record<string, string> = {
  $FONT: "'TikTok Sans', Helvetica, Arial, sans-serif",
  $RED: "#db011c",
  $INK: "#0a0a0a",
  $G7: "#444444",
  $G5: "#6b6b6b",
  $G3: "#d6d6d6",
  $G1: "#f4f4f4",
  $OK: "#1f7a3a",
  $WAIT: "#9a6700",
};

const DIR = path.join(process.cwd(), "src", "emails", "hdc");

function applyTokens(source: string): string {
  return source.replace(/\$(FONT|RED|INK|G7|G5|G3|G1|OK|WAIT)\b/g, (token) => TOKENS[token]);
}

type Env = {
  hb: typeof Handlebars;
  layout: HandlebarsTemplateDelegate;
  templates: Map<string, HandlebarsTemplateDelegate>;
};

let env: Env | null = null;

function escape(s: string): string {
  return Handlebars.escapeExpression(s);
}

function load(): Env {
  if (env && process.env.NODE_ENV === "production") return env;
  const hb = Handlebars.create();

  const localeOf = (options: Handlebars.HelperOptions): Locale => options.data?.root?.locale ?? "el";

  hb.registerHelper("t", function (key: string, options: Handlebars.HelperOptions) {
    return fill(rawString(localeOf(options), key), options.hash ?? {});
  });
  hb.registerHelper("T", function (key: string, options: Handlebars.HelperOptions) {
    return upper(fill(rawString(localeOf(options), key), options.hash ?? {}), localeOf(options));
  });
  /* Strings with our own markup: the string is trusted, its values are escaped. */
  hb.registerHelper("th", function (key: string, options: Handlebars.HelperOptions) {
    return new hb.SafeString(fill(rawString(localeOf(options), key), options.hash ?? {}, escape));
  });
  hb.registerHelper("upper", function (value: string, options: Handlebars.HelperOptions) {
    return upper(String(value ?? ""), localeOf(options));
  });
  hb.registerHelper("img", function (src: string, width: number, options: Handlebars.HelperOptions) {
    if (!isMailImageWidth(width)) throw new Error(`[mail] image width ${width} is not served`);
    return mailImageUrl(src, width, options.data?.root?.assetOrigin ?? mailAssetOrigin());
  });
  hb.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  hb.registerHelper("or", (...args: unknown[]) => args.slice(0, -1).some(Boolean));
  hb.registerHelper("and", (...args: unknown[]) => args.slice(0, -1).every(Boolean));
  hb.registerHelper("minus", (a: number, b: number) => Number(a) - Number(b));
  hb.registerHelper("inc", (a: number) => Number(a) + 1);

  for (const file of readdirSync(path.join(DIR, "partials"))) {
    if (!file.endsWith(".hbs")) continue;
    hb.registerPartial(
      file.replace(/\.hbs$/, ""),
      applyTokens(readFileSync(path.join(DIR, "partials", file), "utf8")),
    );
  }

  const templates = new Map<string, HandlebarsTemplateDelegate>();
  for (const file of readdirSync(path.join(DIR, "templates"))) {
    if (!file.endsWith(".hbs")) continue;
    templates.set(
      file.replace(/\.hbs$/, ""),
      hb.compile(applyTokens(readFileSync(path.join(DIR, "templates", file), "utf8"))),
    );
  }

  const layout = hb.compile(applyTokens(readFileSync(path.join(DIR, "layout.hbs"), "utf8")));
  env = { hb, layout, templates };
  return env;
}

function upper(s: string, locale: Locale): string {
  return locale === "el" ? upGreek(s) : s.toLocaleUpperCase(locale);
}

/** Every template file there is, for the admin list and the tests. */
export function templateFiles(): string[] {
  return [...load().templates.keys()].sort();
}

/**
 * Where pictures and the logo are served from in a real send.
 *
 * `MAIL_ASSET_ORIGIN` when set; otherwise the public site, unless that is a
 * development address — a customer's mail client cannot reach our localhost.
 */
export function mailAssetOrigin(): string {
  const configured = process.env.MAIL_ASSET_ORIGIN?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const origin = siteOrigin();
  return /^https:\/\//.test(origin) && !/localhost|127\.0\.0\.1/.test(origin)
    ? origin
    : "https://milwaukeetoolshdc.gr";
}

/** A page of the shop in the reader's language (`/en/…`, `/it/…`; Greek unprefixed). */
export function localeUrl(locale: Locale, pathname: string): string {
  const origin = siteOrigin();
  if (locale === "el") return `${origin}${pathname}`;
  return `${origin}/${locale}${pathname === "/" ? "" : pathname}`;
}

function siteHost(): string {
  try {
    return new URL(siteOrigin()).host.replace(/^www\./, "");
  } catch {
    return "milwaukeetoolshdc.gr";
  }
}

const FOOTER_WHY: Record<MailKind, AnyKey> = {
  newsletter: "footer.why_newsletter",
  order: "footer.why_order",
  account: "footer.why_account",
  subscribe: "footer.why_subscribe",
  internal: "internal.why",
  admin: "admin.why",
};

/** The shared context: who we are, where things are, in the reader's language. */
export function baseContext(locale: Locale, kind: MailKind, assetOrigin: string) {
  const { weekdays, saturday } = SHOP.contact.hours;
  return {
    locale,
    lang: locale,
    assetOrigin,
    simple: kind === "internal" || kind === "admin",
    newsletter: kind === "newsletter",
    footerWhy: t(locale, FOOTER_WHY[kind], { site: siteHost() }),
    unsubscribe: "%unsubscribe_url%",
    brand: { logo: `${assetOrigin}/brand/hdc-lockup-440.png` },
    site: {
      home: localeUrl(locale, "/"),
      offers: localeUrl(locale, "/prosfores"),
      m18: localeUrl(locale, "/milwaukee-m18"),
      m12: localeUrl(locale, "/milwaukee-m12"),
      packout: localeUrl(locale, "/packout"),
      account: localeUrl(locale, "/logariasmos"),
      terms: localeUrl(locale, "/oroi-chrisis"),
      privacy: localeUrl(locale, "/aporrito"),
      returns: localeUrl(locale, "/epistrofes"),
      newProducts: localeUrl(locale, "/nees-afixeis"),
      host: siteHost(),
    },
    shop: {
      address: SHOP.contact.address,
      email: SHOP.contact.email,
      phone: { display: PRIMARY_PHONE.display, e164: PRIMARY_PHONE.e164 },
      hours: t(locale, "hours", {
        wo: weekdays.open,
        wc: weekdays.close,
        so: saturday.open,
        sc: saturday.close,
      }),
      map: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(SHOP.contact.address)}`,
    },
    social: SOCIAL_LINKS.map((s) => ({ label: s.label, href: s.href })),
    company: SHOP.operator,
  };
}

export type RenderInput = {
  template: string;
  locale: Locale;
  kind: MailKind;
  subject: string;
  preheader: string;
  topline: { left: string; right: string; href?: string };
  data: Record<string, unknown>;
  /** Where pictures load from. Defaults to the public site; the admin preview passes its own host. */
  assetOrigin?: string;
};

export type RenderedEmail = { subject: string; preheader: string; html: string; text: string };

export function renderEmail(input: RenderInput): RenderedEmail {
  const { layout, templates } = load();
  const template = templates.get(input.template);
  if (!template) throw new Error(`[mail] unknown template «${input.template}»`);

  const context = {
    ...baseContext(input.locale, input.kind, input.assetOrigin ?? mailAssetOrigin()),
    title: input.subject,
    preheader: input.preheader,
    topline: input.topline,
    ...input.data,
  };

  const body = template(context);
  const html = layout({ ...context, body });
  return { subject: input.subject, preheader: input.preheader, html, text: htmlToText(html) };
}
