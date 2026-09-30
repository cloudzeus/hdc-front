import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_TTL_MS, MAX_JOBS, clearJobs, getJob, startJob } from "./milwaukee-admin-jobs";

/** Promise που τη λύνει το τεστ. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => clearJobs());
afterEach(() => vi.useRealTimers());

describe("εργασίες Milwaukee", () => {
  it("ξεκινά χωρίς να περιμένει και τελειώνει με το αποτέλεσμα", async () => {
    const d = deferred<{ ok: true; mtrl: number }>();
    const onFinish = vi.fn();
    const r = startJob({ kind: "erp-register", itemId: "a", actor: "x@hdc.test", run: () => d.promise, onFinish });
    if (!r.ok) throw new Error("δεν ξεκίνησε");
    expect(r.reused).toBe(false);
    expect(r.job.status).toBe("running");
    expect(getJob(r.job.id)?.status).toBe("running");
    expect(onFinish).not.toHaveBeenCalled();

    d.resolve({ ok: true, mtrl: 7 });
    await flush();
    const done = getJob(r.job.id)!;
    expect(done.status).toBe("done");
    expect(done.result).toEqual({ ok: true, mtrl: 7 });
    expect(done.finishedAt).not.toBeNull();
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ id: r.job.id, status: "done" }));
  });

  it("άρνηση του HDCtool ή εξαίρεση → failed με το μήνυμα", async () => {
    const a = startJob({
      kind: "analyze",
      itemId: "a",
      actor: "x",
      run: async () => ({ ok: false, status: 409, error: "Τρέχει ήδη" }),
    });
    const b = startJob({
      kind: "translate",
      itemId: "a",
      actor: "x",
      run: async () => {
        throw new Error("boom");
      },
    });
    await flush();
    if (!a.ok || !b.ok) throw new Error("δεν ξεκίνησαν");
    expect(getJob(a.job.id)).toMatchObject({ status: "failed", error: "Τρέχει ήδη" });
    expect(getJob(b.job.id)).toMatchObject({ status: "failed", error: "boom" });
  });

  it("η ίδια ενέργεια στο ίδιο item ξαναχρησιμοποιεί την εργασία που τρέχει", async () => {
    const d = deferred<{ ok: true }>();
    const run = vi.fn(() => d.promise);
    const first = startJob({ kind: "analyze", itemId: "a", actor: "x", run });
    const again = startJob({ kind: "analyze", itemId: "a", actor: "x", run });
    const other = startJob({ kind: "analyze", itemId: "b", actor: "x", run });
    if (!first.ok || !again.ok || !other.ok) throw new Error("δεν ξεκίνησαν");
    expect(again.reused).toBe(true);
    expect(again.job.id).toBe(first.job.id);
    expect(other.job.id).not.toBe(first.job.id);
    expect(run).toHaveBeenCalledTimes(2);

    // Από άλλον χρήστη: άρνηση, όχι δεύτερη κλήση.
    expect(startJob({ kind: "analyze", itemId: "a", actor: "y", run })).toMatchObject({ ok: false });
    expect(run).toHaveBeenCalledTimes(2);

    // Μετά το τέλος ξεκινά νέα.
    d.resolve({ ok: true });
    await flush();
    const later = startJob({ kind: "analyze", itemId: "a", actor: "x", run: async () => ({ ok: true }) });
    if (!later.ok) throw new Error("δεν ξεκίνησε");
    expect(later.reused).toBe(false);
  });

  it("ενεργοποίηση: ίδια ids → η ίδια εργασία· άλλα ids όσο τρέχει → άρνηση", () => {
    const d = deferred<{ ok: true }>();
    const run = vi.fn(() => d.promise);
    const first = startJob({ kind: "bulk-activate", itemId: null, key: "a,b", actor: "x", run });
    const same = startJob({ kind: "bulk-activate", itemId: null, key: "a,b", actor: "x", run });
    if (!first.ok || !same.ok) throw new Error("δεν ξεκίνησαν");
    expect(same.reused).toBe(true);
    expect(same.job.id).toBe(first.job.id);

    // Άλλο σύνολο, ακόμη και από τον ίδιο χρήστη: όχι ψεύτικο «Ενεργοποιήθηκε».
    expect(startJob({ kind: "bulk-activate", itemId: null, key: "a", actor: "x", run })).toEqual({
      ok: false,
      error: "Τρέχει ήδη μια ενεργοποίηση· δοκιμάστε σε λίγο",
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("εξαίρεση που δεν είναι Error: το μήνυμα ως κείμενο", async () => {
    const r = startJob({
      kind: "analyze",
      itemId: "z",
      actor: "x",
      run: () => Promise.reject("χάλασε"),
    });
    await flush();
    if (!r.ok) throw new Error("δεν ξεκίνησε");
    expect(getJob(r.job.id)).toMatchObject({ status: "failed", error: "χάλασε" });
  });

  it("μια εργασία που τελείωσε σβήνεται μετά από 30′", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
    const r = startJob({ kind: "translate", itemId: "a", actor: "x", run: async () => ({ ok: true }) });
    if (!r.ok) throw new Error("δεν ξεκίνησε");
    await vi.advanceTimersByTimeAsync(0);
    expect(getJob(r.job.id)?.status).toBe("done");
    vi.setSystemTime(Date.now() + JOB_TTL_MS - 1000);
    expect(getJob(r.job.id)).not.toBeNull();
    vi.setSystemTime(Date.now() + 2000);
    expect(getJob(r.job.id)).toBeNull();
  });

  it("πάνω από το όριο φεύγουν πρώτα οι παλαιότερες που τελείωσαν", async () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_JOBS + 5; i++) {
      const r = startJob({ kind: "translate", itemId: `i${i}`, actor: "x", run: async () => ({ ok: true }) });
      if (r.ok) ids.push(r.job.id);
      await flush();
    }
    // Η επόμενη εκκίνηση κλαδεύει.
    startJob({ kind: "translate", itemId: "last", actor: "x", run: async () => ({ ok: true }) });
    expect(getJob(ids[0]!)).toBeNull();
    expect(getJob(ids.at(-1)!)).not.toBeNull();
  });
});
