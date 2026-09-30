"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/admin/PageShell";
import type { OfficialView } from "@/lib/hdctool/milwaukee-admin-contract";
import { OfficialIndex, OfficialProduct } from "./OfficialView";

/**
 * «Επίσημο site»: τα στοιχεία ενός κωδικού Milwaukee στο ευρετήριο του
 * milwaukeetool.eu, και για κωδικούς χωρίς προϊόν μόνο-XML (`official/by-code`).
 * Η αναζήτηση είναι απλή φόρμα GET: το αποτέλεσμα έχει δικό του URL.
 */
export function OfficialTab({
  code,
  official,
  canEdit,
}: {
  code: string;
  official: OfficialView | null;
  canEdit: boolean;
}) {
  return (
    <div className="space-y-4">
      <form action="/admin/milwaukee" method="get" className="flex flex-wrap gap-2 border border-k-line bg-white p-3">
        <input type="hidden" name="tab" value="official" />
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-k-text-4" aria-hidden />
          <Input
            name="code"
            defaultValue={code}
            maxLength={32}
            placeholder="Κωδικός Milwaukee, π.χ. 4933479862"
            aria-label="Κωδικός Milwaukee"
            className="pl-9 font-mono"
            required
          />
        </div>
        <Button type="submit">Αναζήτηση</Button>
      </form>

      {official && (
        <Panel title={`Κωδικός ${official.articleNumber}`}>
          <div className="space-y-4">
            {official.product ? (
              <OfficialProduct product={official.product} />
            ) : (
              <p className="text-[length:var(--fs-12-5)] font-medium text-k-ink">
                Δεν βρέθηκε στο ευρετήριο. Αν το προϊόν υπάρχει στο XML, η «Αναζήτηση στο επίσημο site» από το πάνελ του
                ψάχνει τη σελίδα του χωρίς να περιμένει τη σάρωση.
              </p>
            )}
            <OfficialIndex index={official.index} canEdit={canEdit} />
          </div>
        </Panel>
      )}

      {!code && (
        <p className="text-[length:var(--fs-12-5)] text-k-text-3">
          Γράψτε έναν κωδικό για να δείτε τα επίσημα στοιχεία του: σελίδα, μοντέλο, EAN και τεχνικά σε αγγλικά και ιταλικά.
        </p>
      )}
    </div>
  );
}
