import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import * as hdc from "@/lib/hdctool/milwaukee-admin";

export const dynamic = "force-dynamic";

/**
 * GET — οι αναγνώσεις της ενότητας /admin/milwaukee που γίνονται από τον
 * browser (ανανέωση πίνακα, πλαϊνό πάνελ, διάλογοι): `?r=<τι>&id=<item>`.
 *
 * Route και όχι server actions: ο client στέλνει τα actions ένα-ένα, οπότε
 * μια ανάλυση AI δύο λεπτών θα πάγωνε κάθε άνοιγμα προϊόντος πίσω της.
 *
 * Θέλει `milwaukee.view`. Απαντά πάντα με το `{ ok, ... }` του client (200),
 * εκτός από 401/403/400 για τον ίδιο τον χρήστη ή το αίτημα.
 */
const READS = {
  overview: (actor: string) => hdc.getOverview(actor),
  items: (actor: string) => hdc.getItems(actor),
  categories: (actor: string) => hdc.getSoftOneCategories(actor),
  item: (actor: string, id: string) => hdc.getItem(actor, id),
  peers: (actor: string, id: string) => hdc.getItemPeers(actor, id),
  analysis: (actor: string, id: string) => hdc.getItemAnalysis(actor, id),
  official: (actor: string, id: string) => hdc.getItemOfficial(actor, id),
} as const;

const NEEDS_ID = new Set(["item", "peers", "analysis", "official"]);

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return reply({ ok: false, status: 401, error: "Η σύνδεση έληξε· συνδεθείτε ξανά" }, 401);
  if (!can(session.user.role, "milwaukee.view")) {
    return reply({ ok: false, status: 403, error: "Χωρίς δικαίωμα «Milwaukee · προβολή»" }, 403);
  }

  const url = new URL(request.url);
  const r = url.searchParams.get("r") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!(r in READS)) return reply({ ok: false, status: 400, error: "Άγνωστη ανάγνωση" }, 400);
  if (NEEDS_ID.has(r) && !/^[\w-]{1,64}$/.test(id)) {
    return reply({ ok: false, status: 400, error: "Μη έγκυρο προϊόν" }, 400);
  }

  const read = READS[r as keyof typeof READS];
  return reply(await read(session.user.email, id));
}
