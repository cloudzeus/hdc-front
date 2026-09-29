import { describe, expect, it } from "vitest";
import { plannedJobs } from "@/lib/cron/schedule";

const prod = { NODE_ENV: "production", HDCTOOL_API_KEY: "key" };

describe("plannedJobs", () => {
  it("runs every job in production", () => {
    expect(plannedJobs(prod)).toEqual(["catalog", "orders"]);
  });

  it("runs nothing in development unless asked", () => {
    expect(plannedJobs({ ...prod, NODE_ENV: "development" })).toEqual([]);
    expect(plannedJobs({ ...prod, NODE_ENV: "development", IN_PROCESS_CRON: "1" })).toEqual([
      "catalog",
      "orders",
    ]);
  });

  it("IN_PROCESS_CRON=0 turns everything off, even in production", () => {
    expect(plannedJobs({ ...prod, IN_PROCESS_CRON: "0" })).toEqual([]);
  });

  it("CRON_DISABLED turns off single jobs, case and spaces aside", () => {
    expect(plannedJobs({ ...prod, CRON_DISABLED: " Orders " })).toEqual(["catalog"]);
    expect(plannedJobs({ ...prod, CRON_DISABLED: "catalog,orders" })).toEqual([]);
  });

  it("skips the catalog job without an HDCtool key", () => {
    expect(plannedJobs({ NODE_ENV: "production" })).toEqual(["orders"]);
  });
});
