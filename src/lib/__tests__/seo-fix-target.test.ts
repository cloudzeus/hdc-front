import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { seoOverride: { findUnique, upsert } } }));

import { Prisma } from "@/generated/prisma/client";
import { modelPath } from "@/lib/milwaukee/model-slug";
import { HUB_KEYS, HUBS } from "@/lib/seo/hubs";
import { seoFixStore } from "@/lib/seo/seo-fix-store";
import { seoTargetForPath } from "@/lib/seo/seo-fix-target";

const ALL = ["seoTitle", "metaDescription", "faq"];

beforeEach(() => {
  findUnique.mockReset();
  upsert.mockReset();
});

describe("seoTargetForPath", () => {
  it("αρχική", () => expect(seoTargetForPath("/")).toEqual({ targetType: "PAGE", targetKey: "/", allowed: ALL }));

  it("κατηγορία", () =>
    expect(seoTargetForPath("/katalogos/trapania")).toEqual({ targetType: "CATEGORY", targetKey: "trapania", allowed: ALL }));

  it("μοντέλο: το root που διαβάζει η σελίδα", () =>
    expect(seoTargetForPath(modelPath("M18 FPD3"))).toEqual({ targetType: "MODEL", targetKey: "M18 FPD3", allowed: ALL }));

  it("προϊόν: χωρίς ερωτήσεις", () =>
    expect(seoTargetForPath("/proion/abc")).toEqual({
      targetType: "PRODUCT",
      targetKey: "abc",
      allowed: ["seoTitle", "metaDescription"],
    }));

  it.each(HUB_KEYS.map((key) => [HUBS[key].path, key]))("%s: hub %s", (path, key) =>
    expect(seoTargetForPath(path)).toEqual({ targetType: "PLATFORM", targetKey: key, allowed: ALL }),
  );

  it.each(["/katalogos", "/katalogos/a/b", "/en", "/en/katalogos/x", "/etaireia", "/montelo/%%%", "/montelo/abc", "/proion"])(
    "%s: null",
    (path) => expect(seoTargetForPath(path)).toBeNull(),
  );
});

describe("seoFixStore", () => {
  const where = { targetType_targetKey: { targetType: "CATEGORY", targetKey: "trapania" } };
  const path = "/katalogos/trapania";

  it("allowed: όσα δίνει η αντιστοίχιση, null εκτός", () => {
    expect(seoFixStore.allowed("/proion/abc")).toEqual(["seoTitle", "metaDescription"]);
    expect(seoFixStore.allowed("/etaireia")).toBeNull();
  });

  it("read: κατά targetType_targetKey, χωρίς εγγραφή όλα null", async () => {
    findUnique.mockResolvedValue(null);
    expect(await seoFixStore.read(path)).toEqual({ seoTitle: null, metaDescription: null, faq: null });
    expect(findUnique.mock.calls[0][0].where).toEqual(where);
  });

  it("read: οι ερωτήσεις περνούν από το faqFromJson, κενή λίστα γίνεται null", async () => {
    findUnique.mockResolvedValue({ seoTitle: "T", metaDescription: null, faq: [{ a: " A ", q: "Q" }, { q: "" }] });
    expect(await seoFixStore.read(path)).toEqual({ seoTitle: "T", metaDescription: null, faq: [{ q: "Q", a: "A" }] });
    findUnique.mockResolvedValue({ seoTitle: null, metaDescription: null, faq: [] });
    expect((await seoFixStore.read(path)).faq).toBeNull();
  });

  it("write: upsert με το updatedBy, χωρίς να αγγίζει h1, intro, body", async () => {
    await seoFixStore.write(path, { seoTitle: "T" }, "u@x");
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual(where);
    expect(arg.update).toEqual({ seoTitle: "T", updatedBy: "u@x" });
    expect(arg.create).toEqual({ targetType: "CATEGORY", targetKey: "trapania", seoTitle: "T", updatedBy: "u@x" });
  });

  it("write: null στο faq γίνεται Prisma.DbNull, faq που λείπει δεν αγγίζεται", async () => {
    await seoFixStore.write(path, { faq: null }, "u@x");
    expect(upsert.mock.calls[0][0].update.faq).toBe(Prisma.DbNull);
    await seoFixStore.write(path, { metaDescription: null }, "u@x");
    expect(upsert.mock.calls[1][0].update).not.toHaveProperty("faq");
  });
});
