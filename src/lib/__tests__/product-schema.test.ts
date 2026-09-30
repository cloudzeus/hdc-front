import { describe, expect, it } from "vitest";
import { SUPPLIER_HANDLING_DAYS } from "@/lib/catalog/availability";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { productJsonLd, shippingDetails } from "@/lib/seo/product-schema";

/**
 * The offer's delivery promise has to match its availability: the supplier's
 * stock is InStock for Google, but it leaves in 3–5 working days, not today.
 */
describe("shippingDetails — handling time follows availability", () => {
  const handling = (a: "stock" | "supplier" | "order") => shippingDetails(a)[0].deliveryTime.handlingTime;

  it("our stock leaves the same or the next day", () => {
    expect(handling("stock")).toMatchObject({ minValue: 0, maxValue: 1, unitCode: "DAY" });
  });
  it("the supplier's leaves in 3–5 days", () => {
    expect(SUPPLIER_HANDLING_DAYS).toEqual({ min: 3, max: 5 });
    expect(handling("supplier")).toMatchObject({ minValue: 3, maxValue: 5, unitCode: "DAY" });
  });
  it("transit is the same either way", () => {
    expect(shippingDetails("supplier")[0].deliveryTime.transitTime).toEqual(
      shippingDetails("stock")[0].deliveryTime.transitTime,
    );
  });
});

describe("shippingDetails — two rules, as the checkout applies them", () => {
  it("is free over the threshold and the real postage below it", () => {
    const [free, paid] = shippingDetails("stock", { postageGross: 4.9, priceNet: 80 });
    expect(free.shippingRate.value).toBe("0");
    expect(free.eligibleTransactionVolume).toMatchObject({ minPrice: FREE_SHIPPING_THRESHOLD_NET });
    expect(paid!.shippingRate.value).toBe("4.90");
    expect(paid!.eligibleTransactionVolume).toMatchObject({ maxPrice: FREE_SHIPPING_THRESHOLD_NET });
  });

  it("has only the free rule for a product over the threshold on its own", () => {
    expect(shippingDetails("stock", { postageGross: 4.9, priceNet: 400 })).toHaveLength(1);
  });
});

describe("productJsonLd", () => {
  const base = {
    url: "https://milwaukeetoolshdc.gr/proion/m18-fpd3-502x",
    origin: "https://milwaukeetoolshdc.gr",
    name: "Κρουστικό δραπανοκατσάβιδο M18 FPD3-502X",
    sku: "4933479860",
    code2: "4933479860",
    model: "M18 FPD3-502X",
    ean: "4058546376543",
    images: ["https://cdn.example/1.webp"],
    availability: "stock" as const,
    priceGross: 499.99,
    priceNet: 403.22,
  };

  it("names the article number, the model and a valid GTIN-13", () => {
    const ld = productJsonLd(base);
    expect(ld).toMatchObject({ mpn: "4933479860", productID: "4933479860", model: "M18 FPD3-502X", gtin13: "4058546376543" });
  });

  it("leaves out a GTIN whose check digit fails", () => {
    const ld = productJsonLd({ ...base, ean: "4058546376544" });
    expect(ld).not.toHaveProperty("gtin13");
    expect(ld).not.toHaveProperty("gtin");
  });

  it("offers the price the page shows, sold by the store", () => {
    const offer = productJsonLd(base).offers!;
    expect(offer.price).toBe("499.99");
    expect(offer.seller).toEqual({ "@id": "https://milwaukeetoolshdc.gr/#shop" });
    expect(offer).not.toHaveProperty("priceSpecification");
  });

  it("during a campaign: the campaign price, the list price struck through, valid until the campaign ends", () => {
    const offer = productJsonLd({ ...base, priceGross: 399.99, listPriceGross: 499.99, offerEndsAt: "2026-10-31T21:59:59.000Z" }).offers!;
    expect(offer.price).toBe("399.99");
    expect(offer.priceValidUntil).toBe("2026-10-31");
    expect(JSON.stringify(offer.priceSpecification)).toContain("StrikethroughPrice");
    expect(JSON.stringify(offer.priceSpecification)).toContain("499.99");
  });

  it("has no offer without a price", () => {
    expect(productJsonLd({ ...base, priceGross: null })).not.toHaveProperty("offers");
  });

  it("rates only from real reviews, and lists them", () => {
    expect(productJsonLd(base)).not.toHaveProperty("aggregateRating");
    const ld = productJsonLd({
      ...base,
      reviews: [
        { rating: 5, title: "Άψογο", body: "Δυνατό.", author: "Γιώργος Π.", date: "2026-09-01T10:00:00.000Z" },
        { rating: 4, title: null, body: "Καλό.", author: "Μαρία Κ.", date: "2026-09-02T10:00:00.000Z" },
      ],
    });
    expect(ld.aggregateRating).toMatchObject({ ratingValue: "4.5", reviewCount: 2 });
    expect(ld.review).toHaveLength(2);
    expect(ld.review![0]).toMatchObject({ author: { "@type": "Person", name: "Γιώργος Π." }, datePublished: "2026-09-01" });
  });
});
