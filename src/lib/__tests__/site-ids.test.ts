import { describe, expect, it } from "vitest";
import { siteId } from "@/lib/seo/site-ids";
import { pageMeta } from "@/lib/seo/urls";
import { SHOP } from "@/config/shop";

/**
 * The ids that tie this site to Google accounts: Search Console, Merchant
 * Center, the Business Profile store code, GA4 and Tag Manager.
 *
 * This shop was copied from the Kolleris eshop, and every one of these used to
 * fall back to a Kolleris id written into the source. On the HDC domain that
 * would verify, measure and report into another shop's accounts. So none has a
 * default any more: absent means the tag, script or feed is simply not there.
 */
describe("siteId", () => {
  it("has no built-in value for any id", () => {
    const env = {};
    expect(siteId("gscVerification", env)).toBeUndefined();
    expect(siteId("merchantId", env)).toBeUndefined();
    expect(siteId("localStoreCode", env)).toBeUndefined();
    expect(siteId("gaId", env)).toBeUndefined();
    expect(siteId("gtmId", env)).toBeUndefined();
  });

  it("reads each id from its own variable", () => {
    const env = {
      NEXT_PUBLIC_GSC_VERIFICATION: "abc_DEF-123",
      NEXT_PUBLIC_MERCHANT_ID: "123456789",
      LOCAL_INVENTORY_STORE_CODE: "hdc-piraeus",
      NEXT_PUBLIC_GA_ID: "G-ABC123XYZ",
      NEXT_PUBLIC_GTM_ID: "GTM-ABCD123",
    };
    expect(siteId("gscVerification", env)).toBe("abc_DEF-123");
    expect(siteId("merchantId", env)).toBe("123456789");
    expect(siteId("localStoreCode", env)).toBe("hdc-piraeus");
    expect(siteId("gaId", env)).toBe("G-ABC123XYZ");
    expect(siteId("gtmId", env)).toBe("GTM-ABCD123");
  });

  it("treats a declared but blank variable as absent", () => {
    // A blank .env line is "", and `"" ?? x` is "" — the bug that once shipped
    // a page with an empty verification tag.
    expect(siteId("gtmId", { NEXT_PUBLIC_GTM_ID: "" })).toBeUndefined();
    expect(siteId("gaId", { NEXT_PUBLIC_GA_ID: "   " })).toBeUndefined();
  });

  it("trims what a deployment form adds", () => {
    expect(siteId("gtmId", { NEXT_PUBLIC_GTM_ID: " GTM-ABCD123,\n" })).toBe("GTM-ABCD123");
  });

  it("drops a value in the wrong shape rather than render it", () => {
    expect(siteId("gaId", { NEXT_PUBLIC_GA_ID: "UA-1234-1" })).toBeUndefined();
    expect(siteId("gtmId", { NEXT_PUBLIC_GTM_ID: "G-ABC123" })).toBeUndefined();
    expect(siteId("merchantId", { NEXT_PUBLIC_MERCHANT_ID: "12a45" })).toBeUndefined();
  });

  it("ignores the Kolleris-era variable names", () => {
    // A Coolify app cloned from the Kolleris one carries these, with Kolleris
    // values. Reading them would put the other shop's ids back.
    const env = {
      GOOGLE_SITE_VERIFICATION: "kolleris-token",
      NEXT_PUBLIC_GOOGLE_MERCHANT_ID: "5834747829",
      GOOGLE_LOCAL_STORE_CODE: "om-8281271752754963088",
      NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-EGS1JNM4EC",
    };
    expect(siteId("gscVerification", env)).toBeUndefined();
    expect(siteId("merchantId", env)).toBeUndefined();
    expect(siteId("localStoreCode", env)).toBeUndefined();
    expect(siteId("gaId", env)).toBeUndefined();
  });
});

describe("pageMeta", () => {
  it("names the shop, not Kolleris, as the Open Graph site", () => {
    const meta = pageMeta({ path: "/", locale: "el", title: "t", description: "d" });
    expect(meta.openGraph.siteName).toBe(SHOP.name);
  });
});
