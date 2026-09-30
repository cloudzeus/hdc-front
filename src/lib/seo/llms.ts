import { PRIMARY_PHONE, SHOP } from "@/config/shop";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { DEFAULT_VAT_RATE } from "@/lib/format";
import { STOCK_HOLD_HOURS } from "@/lib/orders/hold";
import { displayName } from "@/lib/milwaukee/display";
import { parseModel } from "@/lib/milwaukee/model";

/**
 * llms.txt and llms-full.txt — what this site is, for something that reads
 * rather than browses.
 *
 * A crawler follows links; a language model asked "where do I buy an M18
 * battery in Piraeus" reads whatever it can find and quotes it. This is the
 * short, unambiguous version of the shop, in plain sentences, with every
 * number imported rather than typed — a threshold written twice disagrees with
 * itself the first time it changes, and here that would be a public promise the
 * checkout refuses to keep.
 *
 * ── No representation claims ───────────────────────────────────────────────
 *
 * The file this replaces was the Kolleris one: a multi-brand shop calling
 * itself an "official distributor". The HDC sells Milwaukee and is run by
 * ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ; it does not present itself as the manufacturer's dealer,
 * agent or distributor (spec Δ5, `src/config/shop.ts`). `DEALER_WORDING` is
 * the test that keeps it that way, here and in the FAQ copy.
 */

/** Wording that claims to represent a manufacturer. Never in public copy. */
export const DEALER_WORDING =
  /αντιπρ[οό]σωπ|αντιπροσωπε[ίι]|διανομ[εέ]α|επ[ίι]σημη διανομ|εξουσιοδοτημ[εέ]ν|dealer|distribut|authori[sz]ed|official (reseller|partner)|rivenditore autorizzato|concessionari/i;

const C = SHOP.contact;

const HOURS =
  `Monday to Friday ${C.hours.weekdays.open}-${C.hours.weekdays.close}; ` +
  `Saturday ${C.hours.saturday.open}-${C.hours.saturday.close}; closed on Sundays (Europe/Athens).`;

export function llmsTxt(origin: string): string {
  const url = (path: string) => `${origin}${path}`;
  const search = (q: string) => url(`/anazitisi?q=${encodeURIComponent(q)}`);

  return `# ${SHOP.name}

> Milwaukee tools and nothing else, from a store in Piraeus, Greece: M12 and
> M18 cordless tools, MX FUEL equipment, PACKOUT storage, accessories and hand
> tools. Collect from the store or have it delivered anywhere in Greece.

Store: ${SHOP.name}, ${C.street}, ${C.postcode} ${C.city} (Piraeus), Greece
Phone: ${C.phones.map((p) => p.display).join(", ")}
Email: ${C.email}
Hours: ${HOURS}
Operated by: ${SHOP.operator.name} (VAT EL${SHOP.operator.vat})
Language: Greek.
Currency: EUR. Displayed prices include Greek VAT (${DEFAULT_VAT_RATE}%) and exclude shipping.

## What the store carries

- M18: the 18 V cordless platform — drills, impact drivers, grinders, saws,
  batteries and chargers. [Browse M18](${search("M18")})
- M12: the compact 12 V platform. [Browse M12](${search("M12")})
- MX FUEL: cordless equipment for heavy construction. [Browse MX FUEL](${search("MXF")})
- PACKOUT: the modular storage and transport system. [Browse PACKOUT](${search("PACKOUT")})
- Accessories (bits, blades, discs, chucks) and hand tools.

A cordless tool is sold "bare" (tool only, suffix -0, -0X or -0C) or as a kit
with batteries and charger (e.g. -502X = two 5.0 Ah batteries in a case). Each
version has its own Milwaukee article number (10 digits, e.g. 4933479859).

## Finding a product

- [Search](${url("/anazitisi")}?q={query}): by Milwaukee article number, model
  (e.g. "M18 FPD3") or EAN.
- [Catalogue](${url("/katalogos")}): every category.
- [Offers](${url("/prosfores")}) and [new arrivals](${url("/nees-afixeis")}).
- [All models and article numbers](${url("/llms-full.txt")}): every M12, M18
  and MX FUEL model with each version's article number and page.

## Availability, as each product page states it

- "In stock": on the shelf in Piraeus now. Ships the same working day when
  ordered before 15:00, or is ready for collection in about two hours.
- "Available · 3-5 working days": not on our shelf, held by our supplier;
  leaves within 3-5 working days.
- "Delivery 1-3 working days": not currently in stock but still orderable, with
  that delivery estimate.

## Store and policies

- [About the store](${url("/etaireia")})
- [Contact and directions](${url("/epikoinonia")})
- [FAQ](${url("/syxnes-erotiseis")})
- [Shipping and delivery](${url("/apostoli-paradosi")})
- [Payment methods](${url("/tropoi-pliromis")})
- [Returns](${url("/epistrofes")})
- [Warranties](${url("/eggyiseis")})
- [Terms of use](${url("/oroi-chrisis")})
- [Order tracking](${url("/logariasmos/entopismos")}): by order number and email,
  no account needed.

## Machine surfaces

- [Product feed](${url("/feeds/google-merchant.xml")}): the full catalogue.
- [Sitemap](${url("/sitemap.xml")})
- [Product API](${url("/api/acp/products")}) and [Basket API](${url("/api/acp/basket")}):
  for agents; require an API key.

## Answers

**Do you deliver across Greece?** Yes, with ACS courier — next working day in
Attica, one to two working days on the mainland, two to three to the islands.
In-stock orders placed before 15:00 on a working day ship the same day.

**Can I collect from the store?** Yes, free, from ${C.street}, ${C.city}.
In-stock items are ready in about two hours during opening hours.

**How much is shipping?** Free over ${FREE_SHIPPING_THRESHOLD_NET} EUR before VAT.
Below that it is charged by weight and destination and shown before payment.
ACS Express (delivery by 12:00 next day) is priced higher and is never free.

**How can I pay?** Card, IRIS instant payment, or bank transfer. Cash on
delivery is not accepted.

**How long is stock held after I order?** ${STOCK_HOLD_HOURS} hours for an order
awaiting a bank transfer, after which the items return to general availability.

**Can I return something?** Yes, within 14 calendar days of receipt, in the
original packaging and in resaleable condition — the statutory right of
withdrawal under Greek and EU consumer law.

**What warranty do products carry?** The manufacturer's warranty, as stated on
each product page. It covers manufacturing defects, not wear from use.

**Who do I call?** ${PRIMARY_PHONE.display}, or ${C.email}.
`;
}

export type LlmsVersion = {
  /** "M18 FPD3-502X" */
  code: string;
  /** Milwaukee article number. */
  code2: string;
  slug: string;
};

export type LlmsModel = {
  /** "M18 FPD3" */
  root: string;
  /** What the tool is, as the catalogue names it. */
  name: string;
  versions: LlmsVersion[];
};

export type LlmsPlatform = {
  platform: "M12" | "M18" | "MX";
  models: LlmsModel[];
};

const SHORT_LABEL: Record<LlmsPlatform["platform"], string> = { M12: "M12", M18: "M18", MX: "MX FUEL" };

const PLATFORM_LABEL: Record<LlmsPlatform["platform"], string> = {
  M12: "M12 (12 V)",
  M18: "M18 (18 V)",
  MX: "MX FUEL",
};

/**
 * Every model the store lists, per platform, with each version's article
 * number and page. The data comes from the database (see the route); this
 * only writes it down.
 */
export function llmsFullTxt(origin: string, platforms: LlmsPlatform[]): string {
  const present = platforms.filter((p) => p.models.length > 0).map((p) => SHORT_LABEL[p.platform]);
  const listed =
    present.length > 1 ? `${present.slice(0, -1).join(", ")} and ${present.at(-1)}` : (present[0] ?? "");
  const lines: string[] = [
    `# ${SHOP.name} — Milwaukee models and article numbers`,
    "",
    `> Every Milwaukee ${listed} model listed by ${SHOP.name}`,
    `> (${SHOP.contact.city}, Greece), with each version's Milwaukee article number`,
    "> and its product page. Store details: " + `${origin}/llms.txt`,
    "",
  ];

  for (const { platform, models } of platforms) {
    if (!models.length) continue;
    lines.push(`## ${PLATFORM_LABEL[platform]} — ${models.length} models`, "");
    for (const model of models) {
      lines.push(`### ${model.root} — ${model.name}`, "");
      for (const v of model.versions) {
        lines.push(`- ${v.code} · ${v.code2} · ${origin}/proion/${v.slug}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

export type LlmsProductRow = {
  name: string;
  code2: string;
  slug: string;
  platform: string | null;
  modelRoot: string | null;
  modelContent: string | null;
};

const PLATFORM_ORDER: LlmsPlatform["platform"][] = ["M18", "M12", "MX"];

/**
 * Active products → platforms → models → versions. Only products that are a
 * model (`modelRoot`, or a tool code in the name) take part; a version's code is read off
 * the name, and the model is named by what the tool is — the bare version's
 * name without the model code, article number or brand.
 */
export function groupModels(rows: LlmsProductRow[]): LlmsPlatform[] {
  const byRoot = new Map<string, { platform: LlmsPlatform["platform"]; rows: LlmsProductRow[] }>();
  for (const row of rows) {
    // The stored root, or the name's own until the sync has filled it (MX FUEL
    // codes were only taught to `parseModel` on 30/9/2026).
    const root = row.modelRoot ?? parseModel(row.name)?.root;
    if (!root) continue;
    const platform = PLATFORM_ORDER.find((p) => p === row.platform);
    if (!platform) continue;
    const entry = byRoot.get(root) ?? { platform, rows: [] };
    entry.rows.push(row);
    byRoot.set(root, entry);
  }

  const models = [...byRoot.entries()].map(([root, { platform, rows: group }]) => {
    const sorted = [...group].sort(
      (a, b) =>
        Number(a.modelContent !== "bare") - Number(b.modelContent !== "bare") ||
        a.name.localeCompare(b.name),
    );
    const versions = sorted.map((row) => ({
      code: parseModel(row.name)?.code ?? root,
      code2: row.code2,
      slug: row.slug,
    }));
    const lead = sorted[0];
    const leadCode = parseModel(lead.name)?.code;
    let name = displayName(lead.name, lead.code2);
    if (leadCode) name = name.replace(leadCode, " ");
    name = name.replace(/\s+/g, " ").replace(/[\s,;·–-]+$/, "").trim() || root;
    return { platform, model: { root, name, versions } };
  });

  return PLATFORM_ORDER.map((platform) => ({
    platform,
    models: models
      .filter((m) => m.platform === platform)
      .map((m) => m.model)
      .sort((a, b) => a.root.localeCompare(b.root, "en", { numeric: true })),
  })).filter((p) => p.models.length > 0);
}
