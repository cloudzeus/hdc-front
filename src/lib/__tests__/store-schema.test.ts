import { describe, expect, it } from "vitest";
import { SHOP } from "@/config/shop";
import { siteJsonLd, storeMapUrl, storeSameAs } from "@/lib/seo/structured-data";

describe("store structured data", () => {
  it("lists only the profiles it is given, https only", () => {
    expect(storeSameAs({})).toEqual([]);
    expect(
      storeSameAs({
        NEXT_PUBLIC_GBP_URL: "https://maps.app.goo.gl/abc,",
        SHOP_SAME_AS: "https://www.facebook.com/hdc, http://insecure.example, not a url",
      }),
    ).toEqual(["https://maps.app.goo.gl/abc", "https://www.facebook.com/hdc"]);
  });

  it("maps the store by its Business Profile when set, else by its coordinates", () => {
    expect(storeMapUrl({ NEXT_PUBLIC_GBP_URL: "https://maps.app.goo.gl/abc" })).toBe("https://maps.app.goo.gl/abc");
    expect(storeMapUrl({})).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=37\.9/);
  });

  it("describes the store with its logo, map and the area it serves", () => {
    const store = (siteJsonLd("el")["@graph"] as Array<Record<string, unknown>>)[0];
    expect(store["@type"]).toBe("HardwareStore");
    expect(store.logo).toMatch(/\/brand\/hdc-lockup-440\.png$/);
    expect(store.hasMap).toMatch(/^https:\/\//);
    expect(store.areaServed).toMatchObject({ "@type": "Country", identifier: "GR" });
    expect(store.sameAs).toEqual(expect.arrayContaining([SHOP.social.facebook, SHOP.social.instagram]));
  });
});
