import { describe, expect, it } from "vitest";
import { orderTimeline } from "@/lib/orders/timeline";

const states = (status: string, paymentStatus: string) =>
  orderTimeline({ status, paymentStatus }).map((s) => s.state);

describe("orderTimeline", () => {
  it("waits for the money on a fresh bank-transfer order", () => {
    expect(states("CONFIRMED", "PENDING")).toEqual(["done", "now", "todo", "todo"]);
  });

  it("does not call an abandoned card payment paid", () => {
    expect(states("PENDING_PAYMENT", "PENDING")).toEqual(["done", "now", "todo", "todo"]);
  });

  it("moves to preparation once paid", () => {
    expect(states("CONFIRMED", "PAID")).toEqual(["done", "done", "now", "todo"]);
  });

  it("is complete once shipped or delivered", () => {
    expect(states("SHIPPED", "PAID")).toEqual(["done", "done", "done", "done"]);
    expect(states("DELIVERED", "PAID")).toEqual(["done", "done", "done", "done"]);
  });

  it("stops at payment when it failed", () => {
    expect(states("FAILED", "FAILED")).toEqual(["done", "failed", "todo", "todo"]);
    expect(states("CANCELLED", "PENDING")).toEqual(["done", "failed", "todo", "todo"]);
  });
});
