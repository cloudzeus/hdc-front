import { describe, expect, it } from "vitest";
import { hasErpIds, isFeedId } from "@/lib/sync/feed-id";

describe("isFeedId", () => {
  it("accepts ERP MTRLs and negative XML ids, rejects zero and junk", () => {
    expect([12, -3, 0, 1.5, Number.NaN, "7", null].map(isFeedId)).toEqual([true, true, false, false, false, false, false]);
  });
});

describe("hasErpIds (the reconcile's empty-answer guard)", () => {
  it("treats an answer of XML-only ids as empty, so an empty ERP page is still refused", () => {
    expect(hasErpIds(new Set<number>())).toBe(false);
    expect(hasErpIds(new Set([-3, -4]))).toBe(false);
  });

  it("is satisfied by a single ERP MTRL", () => {
    expect(hasErpIds(new Set([-3, 812]))).toBe(true);
  });
});
