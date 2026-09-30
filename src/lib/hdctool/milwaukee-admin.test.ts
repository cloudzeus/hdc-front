import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./milwaukee-admin";

const KEY = "k".repeat(48);
const ACTOR = "ops@milwaukeetoolshdc.gr";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("HDC_ADMIN_API_KEY", KEY);
  vi.stubEnv("HDCTOOL_BASE_URL", "https://hdctool.test/");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init as RequestInit & { headers: Record<string, string> } };
}

describe("αιτήματα", () => {
  it("GET με κλειδί, actor και χωρίς cache", async () => {
    fetchMock.mockResolvedValue(json({ success: true, overview: { generatedAt: "x" } }));
    const r = await api.getOverview(ACTOR);
    const { url, init } = lastCall();
    expect(url).toBe("https://hdctool.test/api/hdc-admin/milwaukee/overview");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.headers["X-HDC-Actor"]).toBe(ACTOR);
    expect(init.cache).toBe("no-store");
    expect(init.body).toBeUndefined();
    expect(r).toEqual({ ok: true, overview: { generatedAt: "x" } });
  });

  it("POST items/[id]: το σώμα είναι το ίδιο το patch", async () => {
    fetchMock.mockResolvedValue(json({ success: true }));
    await api.updateItem(ACTOR, "abc", { nameEl: "Δράπανο", category: null });
    const { url, init } = lastCall();
    expect(url).toBe("https://hdctool.test/api/hdc-admin/milwaukee/items/abc");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ nameEl: "Δράπανο", category: null });
  });

  it("content: { el, en, it }", async () => {
    fetchMock.mockResolvedValue(json({ success: true }));
    const c = { features: ["a"], specs: [] };
    await api.updateItemContent(ACTOR, "abc", { el: c, en: c, it: c });
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ el: c, en: c, it: c });
  });

  it("μαζικές: { ids } και { ids, choice }", async () => {
    fetchMock.mockResolvedValue(json({ success: true, updated: 2 }));
    await api.bulkCategory(ACTOR, ["a", "b"], { mtrcategory: 1, mtrgroup: 2, cccSubgroup2: null });
    expect(lastCall().url).toBe("https://hdctool.test/api/hdc-admin/milwaukee/bulk/category");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      ids: ["a", "b"],
      choice: { mtrcategory: 1, mtrgroup: 2, cccSubgroup2: null },
    });
    await api.bulkArchive(ACTOR, ["a"]);
    expect(lastCall().url).toBe("https://hdctool.test/api/hdc-admin/milwaukee/bulk/archive");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ ids: ["a"] });
  });

  it("spec-labels/approve: { rows }", async () => {
    fetchMock.mockResolvedValue(json({ success: true, approved: 1, rerendered: 3 }));
    const r = await api.approveSpecLabels(ACTOR, [{ en: "Voltage", el: "Τάση" }]);
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ rows: [{ en: "Voltage", el: "Τάση" }] });
    expect(r).toEqual({ ok: true, approved: 1, rerendered: 3 });
  });

  it("translate/analyze/official-search/official-sync χωρίς σώμα", async () => {
    fetchMock.mockResolvedValue(json({ success: true, nameEn: "a", nameIt: "b" }));
    await api.translateItem(ACTOR, "abc");
    expect(lastCall().init.method).toBe("POST");
    expect(lastCall().init.body).toBeUndefined();
    await api.analyzeItem(ACTOR, "abc");
    expect(lastCall().init.body).toBeUndefined();
    await api.searchItemOfficial(ACTOR, "abc");
    expect(lastCall().url).toBe("https://hdctool.test/api/hdc-admin/milwaukee/items/abc/official-search");
    expect(lastCall().init.body).toBeUndefined();
  });

  it("erp-register: fingerprint, code, acceptWithdrawal", async () => {
    fetchMock.mockResolvedValue(
      json({ success: true, mode: "created", mtrl: 9, code: "X", eshopListed: false, alerts: [], warnings: [] }),
    );
    await api.registerInErp(ACTOR, "abc", { fingerprint: "f".repeat(64), code: "X" });
    expect(lastCall().url).toBe("https://hdctool.test/api/hdc-admin/milwaukee/items/abc/erp-register");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ fingerprint: "f".repeat(64), code: "X" });
  });

  it("official/by-code: κωδικός στο query, κωδικοποιημένος", async () => {
    fetchMock.mockResolvedValue(json({ success: true, official: null }));
    await api.getOfficialByCode(ACTOR, "4933 47/1");
    expect(lastCall().url).toBe("https://hdctool.test/api/hdc-admin/milwaukee/official/by-code?code=4933+47%2F1");
  });

  it("το id μπαίνει κωδικοποιημένο στη διαδρομή", async () => {
    fetchMock.mockResolvedValue(json({ success: true, item: {} }));
    await api.getItem(ACTOR, "../overview");
    expect(lastCall().url).toBe("https://hdctool.test/api/hdc-admin/milwaukee/items/..%2Foverview");
  });

  it("official-sync 202 → ok", async () => {
    fetchMock.mockResolvedValue(json({ success: true, started: true }, 202));
    expect(await api.startOfficialSync(ACTOR)).toEqual({ ok: true, started: true });
  });
});

describe("σφάλματα", () => {
  it("χωρίς HDC_ADMIN_API_KEY: μήνυμα, χωρίς κλήση", async () => {
    vi.stubEnv("HDC_ADMIN_API_KEY", "");
    const r = await api.getOverview(ACTOR);
    expect(r).toEqual({ ok: false, status: 401, error: "Λείπει το κλειδί HDC_ADMIN_API_KEY" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 → λείπει ή είναι λάθος το κλειδί", async () => {
    fetchMock.mockResolvedValue(json({ success: false, error: "Unauthorized" }, 401));
    const r = await api.getItems(ACTOR);
    expect(r).toEqual({ ok: false, status: 401, error: "Λείπει ή είναι λάθος το κλειδί HDC_ADMIN_API_KEY" });
    expect(api.isKeyError(r)).toBe(true);
  });

  it("χωρίς χρήστη: άρνηση χωρίς κλήση", async () => {
    const r = await api.getItems("");
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("σφάλμα δικτύου → «Το HDCtool δεν απάντησε»", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await api.getItems(ACTOR)).toEqual({ ok: false, status: 0, error: "Το HDCtool δεν απάντησε" });
  });

  it("409/400/404: το μήνυμα του HDCtool και ο κωδικός", async () => {
    fetchMock.mockResolvedValueOnce(json({ success: false, error: "Τρέχει ήδη η ίδια ενέργεια" }, 409));
    expect(await api.analyzeItem(ACTOR, "a")).toEqual({ ok: false, status: 409, error: "Τρέχει ήδη η ίδια ενέργεια" });
    fetchMock.mockResolvedValueOnce(json({ success: false, error: "Κενή αλλαγή" }, 400));
    expect(await api.updateItem(ACTOR, "a", {})).toEqual({ ok: false, status: 400, error: "Κενή αλλαγή" });
    fetchMock.mockResolvedValueOnce(json({ success: false, error: "Δεν βρέθηκε" }, 404));
    expect(await api.getItem(ACTOR, "a")).toEqual({ ok: false, status: 404, error: "Δεν βρέθηκε" });
  });

  it("τα επιπλέον πεδία μιας άρνησης περνούν (blockers, mtrl)", async () => {
    fetchMock.mockResolvedValueOnce(json({ success: false, error: "Λείπουν", blockers: ["τιμή"] }, 400));
    expect(await api.getErpPreview(ACTOR, "a")).toEqual({ ok: false, status: 400, error: "Λείπουν", blockers: ["τιμή"] });
    fetchMock.mockResolvedValueOnce(json({ success: false, error: "Δεν διαβάστηκε", mtrl: 7 }, 400));
    expect(await api.registerInErp(ACTOR, "a", { fingerprint: "f" })).toEqual({
      ok: false,
      status: 400,
      error: "Δεν διαβάστηκε",
      mtrl: 7,
    });
  });

  it("απάντηση που δεν είναι JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect(await api.getItems(ACTOR)).toEqual({
      ok: false,
      status: 502,
      error: "Μη έγκυρη απάντηση από το HDCtool (HTTP 502)",
    });
  });

  it("500 χωρίς μήνυμα", async () => {
    fetchMock.mockResolvedValue(json({ success: false }, 500));
    expect(await api.getItems(ACTOR)).toEqual({ ok: false, status: 500, error: "Σφάλμα του HDCtool (HTTP 500)" });
  });
});

describe("χρόνοι αναμονής", () => {
  it("20″ για αναγνώσεις, 130″ για AI/μαζικές/αναζήτηση, 310″ για καταχώριση και ενεργοποίηση", () => {
    expect(api.timeoutFor("overview")).toBe(20_000);
    expect(api.timeoutFor("items/a")).toBe(20_000);
    expect(api.timeoutFor("items/a/erp-preview")).toBe(20_000);
    expect(api.timeoutFor("items/a/analyze")).toBe(130_000);
    expect(api.timeoutFor("items/a/translate")).toBe(130_000);
    expect(api.timeoutFor("items/a/official-search")).toBe(130_000);
    expect(api.timeoutFor("bulk/activate")).toBe(310_000);
    expect(api.timeoutFor("bulk/archive")).toBe(130_000);
    expect(api.timeoutFor("bulk/category")).toBe(130_000);
    expect(api.timeoutFor("items/a/erp-register")).toBe(310_000);
  });

  /** fetch που τελειώνει μόνο όταν ακυρωθεί. */
  function hangingFetch() {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
  }

  it("μια ανάγνωση κόβεται στα 20″", async () => {
    vi.useFakeTimers();
    hangingFetch();
    const pending = api.getItems(ACTOR);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toEqual({ ok: false, status: 0, error: "Το HDCtool δεν απάντησε" });
  });

  it("η ανάλυση περιμένει πέρα από τα 20″ και κόβεται στα 130″", async () => {
    vi.useFakeTimers();
    hangingFetch();
    let settled = false;
    const pending = api.analyzeItem(ACTOR, "a").then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(110_000);
    expect(await pending).toEqual({ ok: false, status: 0, error: "Το HDCtool δεν απάντησε" });
  });
});
