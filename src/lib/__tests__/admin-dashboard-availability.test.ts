import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { AVAILABILITY_WHERE } from "@/lib/admin/dashboard";

describe("catalogue availability buckets", () => {
  it("uses the storefront rule: stock, then supplier, then order", () => {
    expect(AVAILABILITY_WHERE.stock).toEqual({ isActive: true, inStock: true });
    expect(AVAILABILITY_WHERE.supplier).toEqual({ isActive: true, inStock: false, supplierAvailable: true });
    expect(AVAILABILITY_WHERE.order).toEqual({ isActive: true, inStock: false, supplierAvailable: false });
    expect(AVAILABILITY_WHERE.xmlOnly).toEqual({ isActive: true, mtrl: { lt: 0 } });
  });
});
