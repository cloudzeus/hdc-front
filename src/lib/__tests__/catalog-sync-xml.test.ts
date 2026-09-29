import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The catalogue sync with XML-only products (negative ids), against an
 * in-memory `products` table. Only what the sync paths touch is faked.
 */

type Row = {
  id: string;
  mtrl: number;
  xmlCode: string | null;
  slug: string;
  isActive: boolean;
  inStock: boolean;
  supplierAvailable: boolean;
  qty: number;
  firstListedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const db = vi.hoisted(() => ({ rows: [] as Row[], seq: 0, failMtrl: new Set<number>() }));

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = (row as Record<string, unknown>)[key];
    if (cond && typeof cond === "object") {
      const c = cond as { in?: unknown[]; notIn?: unknown[]; lt?: number; gt?: number };
      if (c.in && !c.in.includes(value)) return false;
      if (c.notIn && c.notIn.includes(value)) return false;
      if (c.lt !== undefined && !((value as number) < c.lt)) return false;
      if (c.gt !== undefined && !((value as number) > c.gt)) return false;
    } else if (value !== cond) return false;
  }
  return true;
}

vi.mock("@/lib/prisma", () => {
  const noop = async () => ({ count: 0 });
  const anyModel = new Proxy({}, { get: () => noop });
  const product = {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      db.rows
        .filter((r) => matches(r, where))
        .map((r) => ({ ...r, images: [], translations: [], specs: [], colors: [], sizes: [] })),
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = db.rows.find((r) => r.id === where.id)!;
      Object.assign(row, data, { updatedAt: new Date(Date.now() + 1) });
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const hit = db.rows.filter((r) => matches(r, where));
      for (const row of hit) Object.assign(row, data);
      return { count: hit.length };
    },
    upsert: async ({
      where,
      update,
      create,
    }: {
      where: { mtrl: number };
      update: Partial<Row>;
      create: Partial<Row>;
    }) => {
      if (db.failMtrl.has(where.mtrl)) throw new Error("write failed");
      const row = db.rows.find((r) => r.mtrl === where.mtrl);
      // The unique index on xmlCode, reported the way the pg adapter does.
      const code = row ? update.xmlCode : create.xmlCode;
      if (code && db.rows.some((r) => r !== row && r.xmlCode === code)) {
        throw Object.assign(new Error("Unique constraint failed"), {
          code: "P2002",
          meta: { driverAdapterError: { cause: { constraint: { fields: ['"xmlCode"'] } } } },
        });
      }
      if (row) {
        Object.assign(row, update, { updatedAt: new Date(row.createdAt.getTime() + 1) });
        return row;
      }
      const now = new Date();
      const fresh = {
        id: `row${++db.seq}`,
        xmlCode: null,
        firstListedAt: null,
        ...create,
        createdAt: now,
        updatedAt: now,
      } as Row;
      db.rows.push(fresh);
      return fresh;
    },
  };
  const prisma = new Proxy(
    {
      product,
      brand: { findMany: async () => [], updateMany: noop },
      syncState: { upsert: async () => ({ id: "state" }), update: noop },
      syncRun: { create: async () => ({ id: "run" }), update: noop },
      $executeRaw: async () => 0,
      $transaction: async (ops: unknown[]) => Promise.all(ops),
    } as Record<string, unknown>,
    { get: (target, key: string) => target[key] ?? anyModel },
  );
  return { prisma };
});

vi.mock("@/lib/catalog/variant-lead", () => ({ refreshVariantLeads: async () => undefined }));

const hdc = vi.hoisted(() => ({ products: vi.fn(), catalogDelta: vi.fn() }));
vi.mock("@/lib/hdctool/client", () => ({ hdctool: hdc, HDCTOOL_MAX_LIMIT: 200 }));

import { reconcileCatalog, syncProducts, syncProductsByMtrl } from "@/lib/sync/catalog-sync";

function product(mtrl: number, extra: Record<string, unknown> = {}) {
  return {
    id: `p${mtrl}`,
    mtrl,
    code: `C${mtrl}`,
    code1: "",
    code2: `4933${Math.abs(mtrl)}`,
    name: `M18 TOOL ${mtrl}`,
    name1: null,
    priceRetail: null,
    priceWholesale: 50,
    pricer01: null,
    pricer02: 124,
    priceWeb: null,
    brandDiscount: 0,
    quantity: 0,
    unit: null,
    brand: { id: "b-milwaukee", name: "Milwaukee", logo: null, mtrmark: 1364 },
    mtrcategory: 1,
    mtrgroup: 2,
    cccSubgroup2: null,
    vat: { code: 1, percentage: 24 },
    country: { code: null, name: null, intCode: null },
    width: null,
    length: null,
    height: null,
    weight: null,
    guaranteeTime: null,
    images: [],
    translations: [],
    specifications: [],
    features: [],
    insDate: null,
    updDate: null,
    createdAt: "2026-09-29T00:00:00Z",
    updatedAt: "2026-09-29T00:00:00Z",
    ...extra,
  };
}

function page(products: unknown[], hasNext = false) {
  return { products, pagination: { page: 1, limit: 200, total: products.length, hasNext, nextCursor: null } };
}

function row(id: string, mtrl: number, xmlCode: string | null, slug: string, isActive = true): Row {
  const at = new Date("2026-09-01T00:00:00Z");
  return {
    id, mtrl, xmlCode, slug, isActive, inStock: false, supplierAvailable: isActive, qty: 0,
    firstListedAt: at, createdAt: at, updatedAt: at,
  };
}

/** HDCtool honouring the `mtrl` filter, from a fixed catalogue. */
function serve(catalogue: ReturnType<typeof product>[]) {
  hdc.products.mockImplementation(async (params: { mtrl?: number[] }) =>
    page(catalogue.filter((p) => params.mtrl?.includes(p.mtrl))),
  );
}

beforeEach(() => {
  db.rows = [];
  db.seq = 0;
  db.failMtrl = new Set();
  hdc.products.mockReset();
  hdc.catalogDelta.mockReset();
});

describe("syncProductsByMtrl with XML-only products", () => {
  it("creates an XML-only product under its negative id, sold from the supplier", async () => {
    serve([product(-3, { xmlCode: "P1", supplierAvailable: true })]);
    const result = await syncProductsByMtrl([-3]);
    expect(result.created).toBe(1);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ mtrl: -3, xmlCode: "P1", supplierAvailable: true, qty: 0, inStock: false, isActive: true });
  });

  it("moves the XML row onto its real MTRL before reading stored rows, keeping the slug", async () => {
    db.rows.push(row("row1", -3, "P1", "m18-xml-slug"));
    serve([product(812, { xmlCode: "P1" })]);
    const result = await syncProductsByMtrl([812]);
    expect(result).toMatchObject({ created: 0, updated: 1, failed: 0 });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ id: "row1", mtrl: 812, xmlCode: "P1", slug: "m18-xml-slug" });
  });

  it("retires the XML row when the MTRL already has a row, which takes the code", async () => {
    db.rows.push(row("row1", -3, "P1", "xml-slug"), row("row2", 812, null, "erp-slug"));
    serve([product(812, { xmlCode: "P1" })]);
    await syncProductsByMtrl([812]);
    expect(db.rows.find((r) => r.id === "row1")).toMatchObject({ mtrl: -3, xmlCode: null, isActive: false });
    expect(db.rows.find((r) => r.id === "row2")).toMatchObject({ mtrl: 812, xmlCode: "P1", slug: "erp-slug" });
  });

  it("never erases an xmlCode when the ERP product arrives without one", async () => {
    db.rows.push(row("row1", 812, "P1", "slug"));
    serve([product(812)]);
    await syncProductsByMtrl([812]);
    expect(db.rows[0].xmlCode).toBe("P1");
  });

  it("frees an ERP row's code when an XML-only product arrives with it", async () => {
    db.rows.push(row("erp", 812, "P1", "erp-slug"));
    serve([product(-5, { xmlCode: "P1", supplierAvailable: true })]);
    const result = await syncProductsByMtrl([-5]);
    expect(result.failed).toBe(0);
    expect(db.rows.find((r) => r.id === "erp")?.xmlCode).toBeNull();
    expect(db.rows.find((r) => r.mtrl === -5)?.xmlCode).toBe("P1");
  });

  it("follows HDCtool when it re-links a code from one MTRL to another", async () => {
    db.rows.push(row("old", 812, "P1", "old-slug"));
    serve([product(900, { xmlCode: "P1" })]);
    const result = await syncProductsByMtrl([900]);
    expect(result.failed).toBe(0);
    expect(db.rows.find((r) => r.id === "old")).toMatchObject({ mtrl: 812, xmlCode: null, slug: "old-slug" });
    expect(db.rows.find((r) => r.mtrl === 900)?.xmlCode).toBe("P1");
  });

  it("frees the old XML row's code when the item comes back under a new feed sequence", async () => {
    db.rows.push(row("old", -3, "P1", "old-slug"));
    serve([product(-5, { xmlCode: "P1", supplierAvailable: true })]);
    const result = await syncProductsByMtrl([-5]);
    expect(result.failed).toBe(0);
    expect(db.rows.find((r) => r.id === "old")?.xmlCode).toBeNull();
    expect(db.rows.find((r) => r.mtrl === -5)?.xmlCode).toBe("P1");
  });

  it("writes a product without its code, rather than failing it, when the code is still taken", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    serve([product(812, { xmlCode: "P1" }), product(900, { xmlCode: "P1" })]);
    const result = await syncProductsByMtrl([812, 900]);
    expect(result).toMatchObject({ created: 2, failed: 0 });
    expect(db.rows.filter((r) => r.xmlCode === "P1")).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("de-lists an XML-only id that HDCtool no longer returns", async () => {
    db.rows.push(row("row1", -3, "P1", "slug"));
    serve([]);
    const result = await syncProductsByMtrl([-3]);
    expect(result.removed).toBe(1);
    expect(db.rows[0].isActive).toBe(false);
  });
});

describe("syncProducts (full walk)", () => {
  it("walks the XML-only products too, so the sweep keeps them", async () => {
    db.rows.push(row("gone", 700, null, "gone"));
    hdc.products.mockImplementation(async (params: { source?: string; page?: number }) =>
      params.source === "xml"
        ? page([product(-3, { xmlCode: "P1", supplierAvailable: true })])
        : page([product(812)]),
    );
    await syncProducts({ maxPages: 3 });
    expect(hdc.products).toHaveBeenCalledWith(expect.objectContaining({ source: "xml", page: 1 }));
    expect(db.rows.find((r) => r.mtrl === -3)?.isActive).toBe(true);
    expect(db.rows.find((r) => r.mtrl === 812)?.isActive).toBe(true);
    expect(db.rows.find((r) => r.mtrl === 700)?.isActive).toBe(false);
  });
});

describe("syncProducts (full walk) when one side fails", () => {
  const walk = (xml: () => Promise<unknown>) =>
    hdc.products.mockImplementation(async (params: { source?: string }) =>
      params.source === "xml" ? xml() : page([product(812)]),
    );

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.rows.push(row("gone-erp", 700, null, "a"), row("gone-xml", -9, "P9", "b"));
  });

  it("sweeps ERP rows but leaves XML-only rows alone when the XML walk throws", async () => {
    walk(async () => {
      throw new Error("HDCtool down");
    });
    const result = await syncProducts({ maxPages: 3 });
    expect(result.failed).toBeGreaterThan(0);
    expect(db.rows.find((r) => r.id === "gone-erp")?.isActive).toBe(false);
    expect(db.rows.find((r) => r.id === "gone-xml")?.isActive).toBe(true);
    expect(db.rows.find((r) => r.mtrl === 812)?.isActive).toBe(true);
  });

  it("sweeps XML-only rows too when both walks are clean", async () => {
    walk(async () => page([product(-3, { xmlCode: "P3", supplierAvailable: true })]));
    await syncProducts({ maxPages: 3 });
    expect(db.rows.find((r) => r.id === "gone-erp")?.isActive).toBe(false);
    expect(db.rows.find((r) => r.id === "gone-xml")?.isActive).toBe(false);
    expect(db.rows.find((r) => r.mtrl === -3)?.isActive).toBe(true);
  });

  it("sweeps nothing when the ERP walk had errors", async () => {
    db.failMtrl.add(812);
    walk(async () => page([]));
    await syncProducts({ maxPages: 3 });
    expect(db.rows.find((r) => r.id === "gone-erp")?.isActive).toBe(true);
    expect(db.rows.find((r) => r.id === "gone-xml")?.isActive).toBe(true);
  });

  it("stops the XML walk, and keeps XML-only rows, when HDCtool answers with ERP products (older build)", async () => {
    walk(async () => page([product(555)], true));
    await syncProducts({ maxPages: 3 });
    expect(db.rows.find((r) => r.mtrl === 555)).toBeUndefined();
    expect(db.rows.find((r) => r.id === "gone-xml")?.isActive).toBe(true);
    expect(hdc.products.mock.calls.filter(([p]) => (p as { source?: string }).source === "xml")).toHaveLength(1);
  });
});

describe("reconcileCatalog with XML-only ids", () => {
  it("refuses an answer that has XML-only ids but no ERP ids", async () => {
    db.rows.push(row("row1", 812, null, "a"));
    hdc.catalogDelta.mockResolvedValue({ mtrl: [-3, -4], nextAfterMtrl: null });
    await expect(reconcileCatalog()).rejects.toThrow(/Reconcile refused/);
    expect(db.rows[0].isActive).toBe(true);
  });

  it("syncs a missing XML-only id and keeps the ones listed", async () => {
    db.rows.push(row("row1", 812, null, "a"), row("row2", -4, "P4", "b"));
    hdc.catalogDelta.mockResolvedValue({ mtrl: [812, -4, -3], nextAfterMtrl: null });
    serve([product(-3, { xmlCode: "P3", supplierAvailable: true })]);
    const result = await reconcileCatalog();
    expect(result.removed).toBe(0);
    expect(db.rows.map((r) => [r.mtrl, r.isActive])).toEqual([[812, true], [-4, true], [-3, true]]);
  });
});
