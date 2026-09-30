"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { sortForPicker, type SoftOneCategories, type SoftOneNode } from "@/lib/hdctool/milwaukee-admin-contract";
import { cn } from "@/lib/utils";

/** Η επιλογή σε εξέλιξη: μπορεί να λείπουν ομάδα/υποομάδα. */
export type PartialChoice = { mtrcategory: number | null; mtrgroup: number | null; cccSubgroup2: number | null };

export const EMPTY_CHOICE: PartialChoice = { mtrcategory: null, mtrgroup: null, cccSubgroup2: null };

/**
 * Κατηγορία SoftOne → Ομάδα → Υποομάδα, με αναζήτηση. Πρώτα όσα έχουν ήδη
 * είδη Milwaukee (με το πλήθος), μετά «Όλα του SoftOne». Αλλαγή επιπέδου
 * καθαρίζει τα από κάτω.
 */
export function CategoryPicker({
  data,
  value,
  onChange,
  disabled,
}: {
  data: SoftOneCategories;
  value: PartialChoice;
  onChange: (next: PartialChoice) => void;
  disabled?: boolean;
}) {
  const groups = data.groups.filter((g) => g.categoryId === value.mtrcategory);
  const subgroups = data.subgroups.filter((s) => s.groupId === value.mtrgroup);
  const group = data.groups.find((g) => g.id === value.mtrgroup);
  const chosen = [
    data.categories.find((c) => c.id === value.mtrcategory),
    group,
    data.subgroups.find((s) => s.id === value.cccSubgroup2),
  ].filter((n): n is SoftOneNode => n != null);
  const newInEshop = chosen.some((n) => !n.inMilwaukeeTree);

  return (
    <div className="space-y-2">
      <NodeCombobox
        label="Κατηγορία SoftOne"
        nodes={data.categories}
        value={value.mtrcategory}
        disabled={disabled}
        onChange={(id) => onChange({ mtrcategory: id, mtrgroup: null, cccSubgroup2: null })}
      />
      <NodeCombobox
        label="Ομάδα"
        nodes={groups}
        value={value.mtrgroup}
        disabled={disabled || value.mtrcategory == null}
        onChange={(id) => onChange({ ...value, mtrgroup: id, cccSubgroup2: null })}
      />
      <NodeCombobox
        label={group?.hasSubgroups ? "Υποομάδα (απαιτείται)" : "Υποομάδα (προαιρετικό)"}
        nodes={subgroups}
        value={value.cccSubgroup2}
        disabled={disabled || value.mtrgroup == null || subgroups.length === 0}
        allowClear
        onChange={(id) => onChange({ ...value, cccSubgroup2: id })}
      />
      {newInEshop && (
        <p className="flex items-center gap-1.5 text-[length:var(--fs-12)] text-k-text-3">
          <Sparkles className="size-3.5 shrink-0" aria-hidden />
          Θα δημιουργηθεί στο eshop με την ενεργοποίηση.
        </p>
      )}
    </div>
  );
}

function NodeCombobox({
  label,
  nodes,
  value,
  disabled,
  allowClear,
  onChange,
}: {
  label: string;
  nodes: SoftOneNode[];
  value: number | null;
  disabled?: boolean;
  allowClear?: boolean;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const sorted = sortForPicker(nodes);
  const selected = nodes.find((n) => n.id === value);
  const used = sorted.filter((n) => n.milwaukeeCount > 0);
  const rest = sorted.filter((n) => n.milwaukeeCount === 0);
  const pick = (id: number | null) => {
    onChange(id);
    setOpen(false);
  };
  const item = (n: SoftOneNode) => (
    <CommandItem key={n.id} value={`${n.code} ${n.name} #${n.id}`} onSelect={() => pick(n.id)}>
      <Check className={cn("size-4", n.id === value ? "opacity-100" : "opacity-0")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{n.name}</span>
      <span className="font-mono text-[length:var(--fs-11)] text-k-text-4">{n.code}</span>
      {n.milwaukeeCount > 0 && (
        <span className="numeral bg-k-blue/10 px-1 text-[length:var(--fs-11)] text-k-blue">
          {n.milwaukeeCount.toLocaleString("el-GR")}
        </span>
      )}
    </CommandItem>
  );

  return (
    <div className="space-y-1">
      <Label className="text-[length:var(--fs-12)] text-k-text-3">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={`${label}: ${selected ? selected.name : "καμία επιλογή"}`}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selected && "text-k-text-4")}>
              {selected ? `${selected.name} · ${selected.code}` : "Επιλογή…"}
            </span>
            <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[min(18rem,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Αναζήτηση σε όνομα ή κωδικό…" />
            <CommandList>
              <CommandEmpty>Δεν βρέθηκε.</CommandEmpty>
              {allowClear && value != null && (
                <CommandGroup>
                  <CommandItem value="— καμία —" onSelect={() => pick(null)}>
                    Καμία
                  </CommandItem>
                </CommandGroup>
              )}
              {used.length > 0 && <CommandGroup heading="Με είδη Milwaukee">{used.map(item)}</CommandGroup>}
              {rest.length > 0 && <CommandGroup heading="Όλα του SoftOne">{rest.map(item)}</CommandGroup>}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
