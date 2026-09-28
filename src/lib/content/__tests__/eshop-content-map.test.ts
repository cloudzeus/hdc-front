import { describe, expect, it } from "vitest";
import type { HdctoolEshopContent } from "@/lib/hdctool/client";
import { faqView, findTerm, isEshopContent, pickLocale, termView } from "@/lib/content/eshop-content-map";

/** The documented response of GET /api/public/eshop-content?site=hdc. */
const FIXTURE: HdctoolEshopContent = {
  success: true,
  site: "hdc",
  terms: [
    {
      slug: "cookie-policy-kolleris-com",
      title: { el: "Πολιτική Cookies", en: "Cookie policy", it: "" },
      content: { el: "<p>Cookies ελληνικά</p>", en: "<p>Cookies English</p>", it: "" },
      updatedAt: "2026-09-20T10:00:00.000Z",
    },
    {
      slug: "personal-data-protection-policy",
      title: { el: "Προστασία προσωπικών δεδομένων", en: "", it: "" },
      content: { el: "<h2>Υπεύθυνος</h2><p>Κείμενο</p>", en: "", it: "" },
      updatedAt: "2026-09-21T10:00:00.000Z",
    },
    {
      slug: "return-policy",
      title: { el: "Πολιτική επιστροφών", en: "Return policy", it: "Resi" },
      content: { el: "<p>14 ημέρες</p>", en: "<p>14 days</p>", it: "<p>14 giorni</p>" },
      updatedAt: "2026-09-22T10:00:00.000Z",
    },
    {
      slug: "terms-of-use",
      title: { el: "Όροι χρήσης", en: "Terms of use", it: "Termini" },
      content: { el: '<p onclick="x()">Όροι<script>bad()</script></p>', en: "<p>&nbsp;</p>", it: "" },
      updatedAt: "2026-09-23T10:00:00.000Z",
    },
  ],
  qanda: [
    {
      slug: "second",
      order: 2,
      question: { el: "Δεύτερη;", en: "Second?", it: "" },
      answer: { el: "<p>Β</p>", en: "<p>B</p>", it: "" },
    },
    {
      slug: "first",
      order: 1,
      question: { el: "Πρώτη;", en: "", it: "" },
      answer: { el: "<p>Α <strong>έντονο</strong></p>", en: "", it: "" },
    },
    {
      slug: "empty",
      order: 3,
      question: { el: "Κενή;", en: "", it: "" },
      answer: { el: "<p> </p>", en: "", it: "" },
    },
  ],
};

describe("findTerm", () => {
  it("maps each page to its HDCtool slug", () => {
    expect(findTerm(FIXTURE.terms, "terms")?.slug).toBe("terms-of-use");
    expect(findTerm(FIXTURE.terms, "returns")?.slug).toBe("return-policy");
    expect(findTerm(FIXTURE.terms, "privacy")?.slug).toBe("personal-data-protection-policy");
  });
  it("finds the cookie policy by prefix, whatever domain the slug carries", () => {
    expect(findTerm(FIXTURE.terms, "cookies")?.slug).toBe("cookie-policy-kolleris-com");
    expect(findTerm([{ ...FIXTURE.terms[0]!, slug: "cookie-policy" }], "cookies")).not.toBeNull();
  });
  it("is null when the term is missing", () => {
    expect(findTerm([], "terms")).toBeNull();
    expect(findTerm([{ ...FIXTURE.terms[0]!, slug: null }], "cookies")).toBeNull();
  });
});

describe("pickLocale", () => {
  it("uses the page language, and falls back to Greek when it is empty", () => {
    expect(pickLocale({ el: "α", en: "a", it: "" }, "en")).toEqual({ value: "a", fallback: false });
    expect(pickLocale({ el: "α", en: "a", it: "" }, "it")).toEqual({ value: "α", fallback: true });
    expect(pickLocale({ el: "α", en: "<p>&nbsp;</p>", it: "" }, "en")).toEqual({ value: "α", fallback: true });
    expect(pickLocale({ el: "α", en: "", it: "" }, "el")).toEqual({ value: "α", fallback: false });
  });
});

describe("termView", () => {
  it("sanitizes the content and flags a Greek fallback", () => {
    const view = termView(findTerm(FIXTURE.terms, "terms"), "en");
    expect(view).toEqual({
      title: "Terms of use",
      html: "<p>Όροι</p>",
      updatedAt: "2026-09-23T10:00:00.000Z",
      fallback: true,
    });
  });
  it("uses the page language when HDCtool has it", () => {
    expect(termView(findTerm(FIXTURE.terms, "returns"), "it")?.html).toBe("<p>14 giorni</p>");
    expect(termView(findTerm(FIXTURE.terms, "returns"), "it")?.fallback).toBe(false);
  });
  it("is null for a missing or empty term", () => {
    expect(termView(null, "el")).toBeNull();
    expect(
      termView({ slug: "terms-of-use", title: { el: "T", en: "", it: "" }, content: { el: "<p></p>", en: "", it: "" }, updatedAt: "" }, "el"),
    ).toBeNull();
  });
});

describe("faqView", () => {
  it("keeps HDCtool's order, drops empty answers, and gives plain text for JSON-LD", () => {
    const items = faqView(FIXTURE.qanda, "el");
    expect(items.map((i) => i.id)).toEqual(["first", "second"]);
    expect(items[0]).toMatchObject({
      question: "Πρώτη;",
      answerHtml: "<p>Α <strong>έντονο</strong></p>",
      answerText: "Α έντονο",
      fallback: false,
    });
  });
  it("mixes languages per item on an English page", () => {
    const items = faqView(FIXTURE.qanda, "en");
    expect(items[0]).toMatchObject({ question: "Πρώτη;", fallback: true });
    expect(items[1]).toMatchObject({ question: "Second?", answerText: "B", fallback: false });
  });
});

describe("isEshopContent", () => {
  it("accepts the documented shape only", () => {
    expect(isEshopContent(FIXTURE)).toBe(true);
    expect(isEshopContent({ success: false, error: "Unauthorized" })).toBe(false);
    expect(isEshopContent(null)).toBe(false);
  });
});
