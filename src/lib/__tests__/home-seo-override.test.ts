import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { seoFor } = vi.hoisted(() => ({ seoFor: vi.fn() }));
vi.mock("@/lib/seo/seo-for", () => ({ seoFor }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => {},
}));
vi.mock("@/lib/cart/cart", () => ({ getMiniCart: async () => null }));
vi.mock("@/lib/content/eshop-content", () => ({ getEshopContent: async () => null }));
vi.mock("@/lib/hdc-home", () => ({ drillsHref: () => "/x", resolveHomeCategories: () => [] }));
vi.mock("@/lib/offers/badges", () => ({ discountedNet: (n: number) => n, offerBadgeFor: async () => null }));
vi.mock("@/lib/catalog/queries", () => ({
  getCatalogueStats: async () => null,
  getFeaturedProducts: async () => [],
  getHomeCategorySources: async () => [],
  getHomeNewArrivals: async () => ({ products: [] }),
  getMenuTree: async () => [],
  getProductsByCode2: async () => [],
  getRootCategories: async () => [],
  getTopBrands: async () => [],
}));

import { FaqSection } from "@/components/blog/ArticleView";
import { HomeFaq } from "@/components/home/HomeFaq";
import HomePage, { generateMetadata } from "@/app/[locale]/(home)/page";

const props = { params: Promise.resolve({ locale: "el" as const }) };
const none = { h1: "", title: "", description: "", intro: null, body: null, faq: [], relatedArticles: [], relatedCategories: [], overridden: [] };
const faq = [{ q: "Ερώτηση;", a: "Απάντηση." }];

function all(node: ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node as React.ReactElement<Record<string, unknown>>, ...all(node.props.children)];
}

beforeEach(() => seoFor.mockReset().mockResolvedValue(none));

describe("home page SEO override", () => {
  it("διαβάζει το PAGE / με κενό αυτόματο κείμενο", async () => {
    await generateMetadata(props);
    expect(seoFor).toHaveBeenCalledWith("PAGE", "/", "el", { h1: "", title: "", description: "" });
  });

  it("χωρίς override: κανένα πεδίο, μένουν του layout", async () => {
    await expect(generateMetadata(props)).resolves.toEqual({});
  });

  it("τίτλος absolute, μόνο τα πεδία που υπάρχουν", async () => {
    seoFor.mockResolvedValue({ ...none, title: "T | HDC" });
    await expect(generateMetadata(props)).resolves.toEqual({ title: { absolute: "T | HDC" } });
    seoFor.mockResolvedValue({ ...none, description: "D" });
    await expect(generateMetadata(props)).resolves.toEqual({ description: "D" });
  });

  it("χωρίς ερωτήσεις: το HomeFaq όπως σήμερα", async () => {
    const tree = all(await HomePage(props));
    expect(tree.some((el) => el.type === HomeFaq)).toBe(true);
    expect(tree.some((el) => el.type === FaqSection)).toBe(false);
  });

  it("με ερωτήσεις: FaqSection αντί για HomeFaq και ένα FAQPage", async () => {
    seoFor.mockResolvedValue({ ...none, faq });
    const tree = all(await HomePage(props));
    expect(tree.some((el) => el.type === HomeFaq)).toBe(false);
    expect(tree.find((el) => el.type === FaqSection)?.props).toMatchObject({ title: "titlos", faq });
    const scripts = tree.filter((el) => el.type === "script");
    expect(scripts).toHaveLength(1);
    const html = (scripts[0].props.dangerouslySetInnerHTML as { __html: string }).__html;
    expect(JSON.parse(html)).toMatchObject({ "@type": "FAQPage" });
  });
});
