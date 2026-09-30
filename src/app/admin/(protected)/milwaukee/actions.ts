"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CAPABILITY_META, can, type Capability } from "@/lib/rbac";
import * as hdc from "@/lib/hdctool/milwaukee-admin";
import type { MilwaukeeFail, MilwaukeeResult } from "@/lib/hdctool/milwaukee-admin";
import {
  MAX_BULK,
  type CategoryChoice,
  type ErpPreviewOk,
  type ErpRegisterOk,
  type ItemContent,
  type ItemPatch,
  type OfficialSearchResult,
  type OfficialView,
  type XmlMissing,
} from "@/lib/hdctool/milwaukee-admin-contract";

/**
 * Ενέργειες της ενότητας /admin/milwaukee. Η δουλειά γίνεται στο HDCtool
 * (`/api/hdc-admin/milwaukee/*`)· εδώ μόνο:
 * - ο έλεγχος δικαιώματος: `milwaukee.edit` για αλλαγές, `milwaukee.erp` για
 *   την καταχώριση στο SoftOne (και την προεπισκόπησή της). Ένα server action
 *   είναι δημόσιο POST endpoint· το κρυμμένο κουμπί δεν είναι έλεγχος·
 * - ο actor: το email του συνδεδεμένου χρήστη πάει στο `X-HDC-Actor`·
 * - μια πρώτη επικύρωση σχήματος (την πλήρη την κάνει το HDCtool)·
 * - η καταγραφή στο `AdminAuditLog` του hdc-front.
 *
 * Καμία δεν πετάει: επιστρέφουν `{ ok, ... }` με ελληνικό μήνυμα.
 */

type Actor = { email: string; userId: string };

async function actorFor(capability: Capability): Promise<({ ok: true } & Actor) | MilwaukeeFail> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401, error: "Η σύνδεση έληξε· συνδεθείτε ξανά" };
  if (!can(session.user.role, capability)) {
    return { ok: false, status: 403, error: `Χωρίς δικαίωμα «${CAPABILITY_META[capability].label}»` };
  }
  if (!session.user.email) return { ok: false, status: 401, error: "Ο λογαριασμός δεν έχει email" };
  return { ok: true, email: session.user.email, userId: session.user.id };
}

/** Η καταγραφή δεν ακυρώνει μια αλλαγή που έγινε ήδη στο HDCtool. */
async function audit(actor: Actor, action: string, entityId: string | null, diff: Record<string, unknown>) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        userId: actor.userId,
        action: action.slice(0, 64),
        entity: "MilwaukeeXmlItem",
        entityId: entityId?.slice(0, 64) ?? null,
        diff: JSON.parse(JSON.stringify(diff)),
      },
    });
  } catch (error) {
    console.error("[admin/milwaukee] audit", action, (error as Error).message);
  }
}

const bad = (error: string): MilwaukeeFail => ({ ok: false, status: 400, error });

const isId = (v: unknown): v is string => typeof v === "string" && /^[\w-]{1,64}$/.test(v);

function idList(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_BULK || !v.every(isId)) return null;
  return [...new Set(v)];
}

const PATCH_KEYS = ["nameEl", "nameEn", "nameIt", "pricingMode", "markupPct", "priceW", "utbl02", "category"] as const;

/** Μόνο τα πεδία που αλλάζει το `updateXmlItem`· τα υπόλοιπα πετιούνται. */
function cleanPatch(raw: unknown): ItemPatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const key of PATCH_KEYS) if (key in raw) out[key] = (raw as Record<string, unknown>)[key];
  return Object.keys(out).length > 0 ? (out as ItemPatch) : null;
}

function isContent(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const c = v as { features?: unknown; specs?: unknown };
  return Array.isArray(c.features) && Array.isArray(c.specs);
}

function isChoice(v: unknown): v is CategoryChoice {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  const int = (x: unknown) => typeof x === "number" && Number.isInteger(x);
  return int(c.mtrcategory) && int(c.mtrgroup) && (c.cccSubgroup2 == null || int(c.cccSubgroup2));
}

// ---------------------------------------------------------------------------
// Ένα item
// ---------------------------------------------------------------------------

export async function milwaukeeUpdateItem(id: string, patch: unknown): Promise<MilwaukeeResult> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  if (!isId(id)) return bad("Μη έγκυρο προϊόν");
  const clean = cleanPatch(patch);
  if (!clean) return bad("Κενή αλλαγή");
  const result = await hdc.updateItem(actor.email, id, clean);
  if (result.ok) await audit(actor, "milwaukee.item.update", id, { patch: clean });
  return result;
}

export async function milwaukeeUpdateContent(id: string, content: unknown): Promise<MilwaukeeResult> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  if (!isId(id)) return bad("Μη έγκυρο προϊόν");
  const c = content as Partial<ItemContent> | null;
  if (!c || !isContent(c.el) || !isContent(c.en) || !isContent(c.it)) {
    return bad("Χρειάζονται και οι τρεις γλώσσες: el, en, it");
  }
  const body: ItemContent = { el: c.el!, en: c.en!, it: c.it! };
  const result = await hdc.updateItemContent(actor.email, id, body);
  if (result.ok) {
    const counts = Object.fromEntries(
      (["el", "en", "it"] as const).map((l) => [l, { features: body[l].features.length, specs: body[l].specs.length }]),
    );
    await audit(actor, "milwaukee.item.content", id, { counts });
  }
  return result;
}

export async function milwaukeeTranslate(id: string): Promise<MilwaukeeResult<{ nameEn: string; nameIt: string }>> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  if (!isId(id)) return bad("Μη έγκυρο προϊόν");
  const result = await hdc.translateItem(actor.email, id);
  if (result.ok) await audit(actor, "milwaukee.item.translate", id, { nameEn: result.nameEn, nameIt: result.nameIt });
  return result;
}

export async function milwaukeeAnalyze(id: string): Promise<MilwaukeeResult<{ dropped: string[]; written: boolean }>> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  if (!isId(id)) return bad("Μη έγκυρο προϊόν");
  const result = await hdc.analyzeItem(actor.email, id);
  if (result.ok) await audit(actor, "milwaukee.item.analyze", id, { written: result.written, dropped: result.dropped.length });
  return result;
}

/** «Αναζήτηση στο επίσημο site»: κατεβάζει έως 3 σελίδες και γράφει στο ευρετήριο, άρα αλλαγή. */
export async function milwaukeeSearchOfficial(
  id: string,
): Promise<MilwaukeeResult<{ search: OfficialSearchResult; official: OfficialView | null }>> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  if (!isId(id)) return bad("Μη έγκυρο προϊόν");
  const result = await hdc.searchItemOfficial(actor.email, id);
  if (result.ok) await audit(actor, "milwaukee.official.search", id, { found: result.search.found });
  return result;
}

/** «Ενημέρωση ευρετηρίου»: ξεκινά τη σάρωση του επίσημου site στο παρασκήνιο. */
export async function milwaukeeStartOfficialSync(): Promise<MilwaukeeResult<{ started: boolean }>> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  const result = await hdc.startOfficialSync(actor.email);
  if (result.ok) await audit(actor, "milwaukee.official.sync", null, {});
  return result;
}

// ---------------------------------------------------------------------------
// Μαζικές
// ---------------------------------------------------------------------------

export async function milwaukeeBulkCategory(ids: unknown, choice: unknown): Promise<MilwaukeeResult<{ updated: number }>> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  const list = idList(ids);
  if (!list) return bad(`Διαλέξτε 1 έως ${MAX_BULK} προϊόντα`);
  if (!isChoice(choice)) return bad("Διαλέξτε κατηγορία και ομάδα");
  const clean = { mtrcategory: choice.mtrcategory, mtrgroup: choice.mtrgroup, cccSubgroup2: choice.cccSubgroup2 ?? null };
  const result = await hdc.bulkCategory(actor.email, list, clean);
  if (result.ok) await audit(actor, "milwaukee.bulk.category", null, { ids: list, choice: clean, updated: result.updated });
  return result;
}

export async function milwaukeeBulkAcceptSuggested(ids: unknown): Promise<MilwaukeeResult<{ updated: number }>> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  const list = idList(ids);
  if (!list) return bad(`Διαλέξτε 1 έως ${MAX_BULK} προϊόντα`);
  const result = await hdc.bulkAcceptSuggested(actor.email, list);
  if (result.ok) await audit(actor, "milwaukee.bulk.accept-suggested", null, { ids: list, updated: result.updated });
  return result;
}

export async function milwaukeeBulkActivate(
  ids: unknown,
): Promise<MilwaukeeResult<{ activated: number; skipped: Array<{ id: string; missing: XmlMissing[] }> }>> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  const list = idList(ids);
  if (!list) return bad(`Διαλέξτε 1 έως ${MAX_BULK} προϊόντα`);
  const result = await hdc.bulkActivate(actor.email, list);
  if (result.ok) {
    await audit(actor, "milwaukee.bulk.activate", null, {
      ids: list,
      activated: result.activated,
      skipped: result.skipped.map((s) => s.id),
    });
  }
  return result;
}

export async function milwaukeeBulkArchive(ids: unknown): Promise<MilwaukeeResult<{ archived: number }>> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  const list = idList(ids);
  if (!list) return bad(`Διαλέξτε 1 έως ${MAX_BULK} προϊόντα`);
  const result = await hdc.bulkArchive(actor.email, list);
  if (result.ok) await audit(actor, "milwaukee.bulk.archive", null, { ids: list, archived: result.archived });
  return result;
}

// ---------------------------------------------------------------------------
// Ετικέτες τεχνικών
// ---------------------------------------------------------------------------

export async function milwaukeeApproveLabels(rows: unknown): Promise<MilwaukeeResult<{ approved: number; rerendered: number }>> {
  const actor = await actorFor("milwaukee.edit");
  if (!actor.ok) return actor;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_BULK) return bad("Διαλέξτε ετικέτες");
  const clean: Array<{ en: string; el: string }> = [];
  for (const r of rows) {
    const { en, el } = (r ?? {}) as { en?: unknown; el?: unknown };
    if (typeof en !== "string" || !en.trim() || typeof el !== "string" || !el.trim()) {
      return bad("Συμπληρώστε ελληνική ετικέτα πριν την έγκριση");
    }
    clean.push({ en, el: el.trim() });
  }
  const result = await hdc.approveSpecLabels(actor.email, clean);
  if (result.ok) {
    await audit(actor, "milwaukee.labels.approve", null, { rows: clean, rerendered: result.rerendered });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Καταχώριση στο SoftOne
// ---------------------------------------------------------------------------

/**
 * Η προεπισκόπηση ρωτά το SoftOne (χωρίς εγγραφή) και ανήκει στη ροή της
 * καταχώρισης: ίδιο δικαίωμα με την αποστολή.
 */
export async function milwaukeeErpPreview(id: string): Promise<MilwaukeeResult<ErpPreviewOk>> {
  const actor = await actorFor("milwaukee.erp");
  if (!actor.ok) return actor;
  if (!isId(id)) return bad("Μη έγκυρο προϊόν");
  return hdc.getErpPreview(actor.email, id);
}

/**
 * «Καταχώριση στο SoftOne»: μόνο από προεπισκόπηση — το `fingerprint` της
 * είναι υποχρεωτικό και το HDCtool αρνείται αν κάτι άλλαξε στο μεταξύ.
 */
export async function milwaukeeRegisterInErp(id: string, input: unknown): Promise<MilwaukeeResult<ErpRegisterOk>> {
  const actor = await actorFor("milwaukee.erp");
  if (!actor.ok) return actor;
  if (!isId(id)) return bad("Μη έγκυρο προϊόν");
  const { fingerprint, code, acceptWithdrawal } = (input ?? {}) as Record<string, unknown>;
  if (typeof fingerprint !== "string" || !fingerprint.trim() || fingerprint.length > 128) {
    return bad("Λείπει το αποτύπωμα της προεπισκόπησης· ανοίξτε ξανά την καταχώριση");
  }
  if (code !== undefined && (typeof code !== "string" || code.length > 64)) return bad("Μη έγκυρος κωδικός");
  const body = {
    fingerprint,
    ...(typeof code === "string" && code ? { code } : {}),
    ...(acceptWithdrawal === true ? { acceptWithdrawal: true } : {}),
  };
  const result = await hdc.registerInErp(actor.email, id, body);
  // Καταγράφεται και η αποτυχία: μια άρνηση μετά τη δημιουργία (`mtrl`) θέλει έλεγχο στο SoftOne.
  await audit(actor, "milwaukee.erp.register", id, {
    ...body,
    ok: result.ok,
    ...(result.ok
      ? { mode: result.mode, mtrl: result.mtrl, code: result.code, alerts: result.alerts }
      : { error: result.error, mtrl: result.mtrl ?? null }),
  });
  return result;
}
