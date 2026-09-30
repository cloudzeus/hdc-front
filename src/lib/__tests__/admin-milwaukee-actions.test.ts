import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Οι ενέργειες του /admin/milwaukee με ψεύτικο session, ψεύτικο HDCtool και
 * ψεύτικη βάση: καμία κλήση δεν φεύγει από το τεστ.
 */
const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => session.current) }));

const auditCreate = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/lib/prisma", () => ({ prisma: { adminAuditLog: { create: auditCreate } } }));

const hdc = vi.hoisted(() => ({
  updateItem: vi.fn(),
  updateItemContent: vi.fn(),
  translateItem: vi.fn(),
  analyzeItem: vi.fn(),
  searchItemOfficial: vi.fn(),
  startOfficialSync: vi.fn(),
  bulkCategory: vi.fn(),
  bulkAcceptSuggested: vi.fn(),
  bulkActivate: vi.fn(),
  bulkArchive: vi.fn(),
  approveSpecLabels: vi.fn(),
  getErpPreview: vi.fn(),
  registerInErp: vi.fn(),
  getOverview: vi.fn(),
  getItems: vi.fn(),
  getSoftOneCategories: vi.fn(),
  getItem: vi.fn(),
  getItemPeers: vi.fn(),
  getItemAnalysis: vi.fn(),
  getItemOfficial: vi.fn(),
}));
vi.mock("@/lib/hdctool/milwaukee-admin", () => hdc);

import { applyRoleCapabilities } from "@/lib/rbac";
import { clearJobs } from "@/lib/hdctool/milwaukee-admin-jobs";
import * as actions from "@/app/admin/(protected)/milwaukee/actions";
import { GET } from "@/app/admin/(protected)/milwaukee/data/route";

function signIn(role: "ADMIN" | "EDITOR" | "OPS", email = "ops@hdc.test") {
  session.current = { user: { id: "u1", email, role } };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  for (const fn of Object.values(hdc)) fn.mockReset();
  auditCreate.mockClear();
  clearJobs();
  // EDITOR: μόνο προβολή · OPS: προβολή και αλλαγές, χωρίς SoftOne.
  applyRoleCapabilities({ EDITOR: ["content", "milwaukee.view"], OPS: ["orders", "milwaukee.edit"] });
  signIn("ADMIN");
});

describe("δικαιώματα", () => {
  it("χωρίς σύνδεση: 401, καμία κλήση", async () => {
    session.current = null;
    expect(await actions.milwaukeeUpdateItem("a", { nameEl: "x" })).toMatchObject({ ok: false, status: 401 });
    expect(hdc.updateItem).not.toHaveBeenCalled();
  });

  it("μόνο προβολή: καμία αλλαγή, καμία καταχώριση", async () => {
    signIn("EDITOR");
    expect(await actions.milwaukeeUpdateItem("a", { nameEl: "x" })).toMatchObject({ ok: false, status: 403 });
    expect(await actions.milwaukeeBulkActivate(["a"])).toMatchObject({ ok: false, status: 403 });
    expect(await actions.milwaukeeApproveLabels([{ en: "Voltage", el: "Τάση" }])).toMatchObject({ ok: false, status: 403 });
    expect(await actions.milwaukeeStartOfficialSync()).toMatchObject({ ok: false, status: 403 });
    expect(await actions.milwaukeeErpPreview("a")).toMatchObject({ ok: false, status: 403 });
    expect(await actions.milwaukeeRegisterInErp("a", { fingerprint: "f" })).toMatchObject({ ok: false, status: 403 });
    for (const fn of Object.values(hdc)) expect(fn).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("αλλαγές χωρίς SoftOne: αλλάζει, δεν καταχωρίζει", async () => {
    signIn("OPS");
    hdc.updateItem.mockResolvedValue({ ok: true });
    expect(await actions.milwaukeeUpdateItem("a", { nameEl: "x" })).toEqual({ ok: true });
    expect(await actions.milwaukeeErpPreview("a")).toMatchObject({ ok: false, status: 403 });
    expect(await actions.milwaukeeRegisterInErp("a", { fingerprint: "f" })).toMatchObject({ ok: false, status: 403 });
    expect(hdc.getErpPreview).not.toHaveBeenCalled();
    expect(hdc.registerInErp).not.toHaveBeenCalled();
  });
});

describe("αλλαγές", () => {
  it("το patch φτάνει καθαρό, με actor το email, και καταγράφεται", async () => {
    hdc.updateItem.mockResolvedValue({ ok: true });
    await actions.milwaukeeUpdateItem("item_1", { nameEl: "Δράπανο", priceW: 10, status: "ACTIVE", category: null });
    expect(hdc.updateItem).toHaveBeenCalledWith("ops@hdc.test", "item_1", { nameEl: "Δράπανο", priceW: 10, category: null });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", action: "milwaukee.item.update", entityId: "item_1" }),
    });
  });

  it("άρνηση του HDCtool: περνά ως έχει, χωρίς καταγραφή", async () => {
    hdc.updateItem.mockResolvedValue({ ok: false, status: 400, error: "Η PRICEW πρέπει να είναι θετική" });
    expect(await actions.milwaukeeUpdateItem("a", { priceW: -1 })).toEqual({
      ok: false,
      status: 400,
      error: "Η PRICEW πρέπει να είναι θετική",
    });
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("κενό patch ή περίεργο id: άρνηση χωρίς κλήση", async () => {
    expect(await actions.milwaukeeUpdateItem("a", { status: "ACTIVE" })).toMatchObject({ ok: false, error: "Κενή αλλαγή" });
    expect(await actions.milwaukeeUpdateItem("../x", { nameEl: "x" })).toMatchObject({ ok: false, status: 400 });
    expect(hdc.updateItem).not.toHaveBeenCalled();
  });

  it("περιεχόμενο: και οι τρεις γλώσσες", async () => {
    const c = { features: ["a"], specs: [] };
    expect(await actions.milwaukeeUpdateContent("a", { el: c, en: c })).toMatchObject({ ok: false, status: 400 });
    hdc.updateItemContent.mockResolvedValue({ ok: true });
    await actions.milwaukeeUpdateContent("a", { el: c, en: c, it: c, extra: 1 });
    expect(hdc.updateItemContent).toHaveBeenCalledWith("ops@hdc.test", "a", { el: c, en: c, it: c });
  });

  it("μαζικές: 1–500 ids χωρίς διπλά, κατηγορία με ακέραια", async () => {
    expect(await actions.milwaukeeBulkArchive([])).toMatchObject({ ok: false, status: 400 });
    expect(await actions.milwaukeeBulkArchive(Array.from({ length: 501 }, (_, i) => `i${i}`))).toMatchObject({ ok: false });
    expect(await actions.milwaukeeBulkCategory(["a"], { mtrcategory: "1", mtrgroup: 2 })).toMatchObject({ ok: false });
    expect(hdc.bulkArchive).not.toHaveBeenCalled();
    hdc.bulkCategory.mockResolvedValue({ ok: true, updated: 2 });
    await actions.milwaukeeBulkCategory(["a", "b", "a"], { mtrcategory: 1, mtrgroup: 2 });
    expect(hdc.bulkCategory).toHaveBeenCalledWith("ops@hdc.test", ["a", "b"], { mtrcategory: 1, mtrgroup: 2, cccSubgroup2: null });
  });
});

describe("καταχώριση στο SoftOne", () => {
  it("χωρίς αποτύπωμα προεπισκόπησης: άρνηση χωρίς κλήση", async () => {
    expect(await actions.milwaukeeRegisterInErp("a", {})).toMatchObject({ ok: false, status: 400 });
    expect(await actions.milwaukeeRegisterInErp("a", { fingerprint: "  " })).toMatchObject({ ok: false, status: 400 });
    expect(hdc.registerInErp).not.toHaveBeenCalled();
  });

  it("επιστρέφει αμέσως jobId· η καταχώριση συνεχίζει και καταγράφεται όταν τελειώσει", async () => {
    let finish!: (v: unknown) => void;
    hdc.registerInErp.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const r = await actions.milwaukeeRegisterInErp("a", { fingerprint: "fp", code: "4933478911", acceptWithdrawal: "yes" });
    expect(r).toMatchObject({ ok: true, reused: false, jobId: expect.any(String) });
    expect(hdc.registerInErp).toHaveBeenCalledWith("ops@hdc.test", "a", { fingerprint: "fp", code: "4933478911" });
    // Γραμμή «ξεκίνησε» αμέσως (αν πέσει η διεργασία, το audit το ξέρει)· το αποτέλεσμα όταν τελειώσει.
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "milwaukee.erp.register.started", entityId: "a" }),
    });

    // Δεύτερο κλικ όσο τρέχει: η ίδια εργασία, όχι δεύτερη καταχώριση.
    const again = await actions.milwaukeeRegisterInErp("a", { fingerprint: "fp", code: "4933478911" });
    expect(again).toMatchObject({ ok: true, reused: true, jobId: r.ok ? r.jobId : "" });
    expect(hdc.registerInErp).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);

    finish({ ok: true, mode: "created", mtrl: 55, code: "4933478911", eshopListed: false, alerts: [], warnings: [] });
    await flush();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "milwaukee.erp.register",
        entityId: "a",
        diff: expect.objectContaining({ ok: true, mtrl: 55, fingerprint: "fp" }),
      }),
    });
  });

  it("η ρητή αποδοχή απόσυρσης περνά μόνο ως true· καταγράφεται και η άρνηση", async () => {
    hdc.registerInErp.mockResolvedValue({ ok: false, status: 400, error: "Άλλαξαν τα στοιχεία" });
    await actions.milwaukeeRegisterInErp("a", { fingerprint: "fp", acceptWithdrawal: true });
    expect(hdc.registerInErp).toHaveBeenCalledWith("ops@hdc.test", "a", { fingerprint: "fp", acceptWithdrawal: true });
    await flush();
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(auditCreate).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        action: "milwaukee.erp.register",
        diff: expect.objectContaining({ ok: false, error: "Άλλαξαν τα στοιχεία" }),
      }),
    });
  });
});

describe("μακριές ενέργειες ως εργασίες", () => {
  it("ανάλυση, μετάφραση, αναζήτηση και ενεργοποίηση επιστρέφουν αμέσως", async () => {
    const never = () => new Promise(() => {});
    hdc.analyzeItem.mockImplementation(never);
    hdc.translateItem.mockImplementation(never);
    hdc.searchItemOfficial.mockImplementation(never);
    hdc.bulkActivate.mockImplementation(never);
    for (const r of [
      await actions.milwaukeeAnalyze("a"),
      await actions.milwaukeeTranslate("a"),
      await actions.milwaukeeSearchOfficial("a"),
      await actions.milwaukeeBulkActivate(["a", "b"]),
    ]) {
      expect(r).toMatchObject({ ok: true, reused: false, jobId: expect.any(String) });
    }
    expect(hdc.bulkActivate).toHaveBeenCalledWith("ops@hdc.test", ["a", "b"]);
  });

  it("ενεργοποίηση: ίδιο σύνολο ids → η ίδια εργασία· άλλο σύνολο → 409", async () => {
    hdc.bulkActivate.mockImplementation(() => new Promise(() => {}));
    const first = await actions.milwaukeeBulkActivate(["b", "a"]);
    const same = await actions.milwaukeeBulkActivate(["a", "b", "a"]);
    expect(first).toMatchObject({ ok: true, reused: false });
    expect(same).toMatchObject({ ok: true, reused: true, jobId: first.ok ? first.jobId : "" });
    expect(await actions.milwaukeeBulkActivate(["a"])).toEqual({
      ok: false,
      status: 409,
      error: "Τρέχει ήδη μια ενεργοποίηση· δοκιμάστε σε λίγο",
    });
    expect(hdc.bulkActivate).toHaveBeenCalledTimes(1);
  });

  it("η ίδια ενέργεια από άλλον χρήστη όσο τρέχει: 409", async () => {
    hdc.analyzeItem.mockImplementation(() => new Promise(() => {}));
    await actions.milwaukeeAnalyze("a");
    signIn("ADMIN", "other@hdc.test");
    expect(await actions.milwaukeeAnalyze("a")).toMatchObject({ ok: false, status: 409 });
    expect(hdc.analyzeItem).toHaveBeenCalledTimes(1);
  });
});

describe("αναγνώσεις (GET /admin/milwaukee/data)", () => {
  const get = (q: string) => GET(new Request(`http://localhost/admin/milwaukee/data?${q}`));

  it("θέλει milwaukee.view", async () => {
    signIn("OPS"); // το edit φέρνει και το view
    hdc.getItems.mockResolvedValue({ ok: true, items: [] });
    expect((await get("r=items")).status).toBe(200);
    applyRoleCapabilities({ OPS: ["orders"] });
    const res = await get("r=items");
    expect(res.status).toBe(403);
    expect(hdc.getItems).toHaveBeenCalledTimes(1);
  });

  it("περνά το id και το email", async () => {
    hdc.getItem.mockResolvedValue({ ok: true, item: { id: "a" } });
    const res = await get("r=item&id=a");
    expect(await res.json()).toEqual({ ok: true, item: { id: "a" } });
    expect(hdc.getItem).toHaveBeenCalledWith("ops@hdc.test", "a");
  });

  it("εργασία: τη βλέπει όποιος την ξεκίνησε ή ένας Διαχειριστής", async () => {
    hdc.translateItem.mockResolvedValue({ ok: true, nameEn: "Drill", nameIt: "Trapano" });
    signIn("OPS");
    const started = await actions.milwaukeeTranslate("a");
    if (!started.ok) throw new Error(started.error);
    await flush();
    const mine = await get(`r=job&id=${started.jobId}`);
    expect(await mine.json()).toMatchObject({
      ok: true,
      job: { status: "done", result: { ok: true, nameEn: "Drill", nameIt: "Trapano" } },
    });

    signIn("OPS", "someone@hdc.test");
    expect((await get(`r=job&id=${started.jobId}`)).status).toBe(404);
    signIn("ADMIN", "boss@hdc.test");
    expect((await get(`r=job&id=${started.jobId}`)).status).toBe(200);
    expect((await get("r=job&id=missing")).status).toBe(404);
  });

  it("άγνωστη ανάγνωση ή id: 400", async () => {
    expect((await get("r=erp-register&id=a")).status).toBe(400);
    expect((await get("r=toString")).status).toBe(400);
    expect((await get("r=item&id=../x")).status).toBe(400);
  });
});
