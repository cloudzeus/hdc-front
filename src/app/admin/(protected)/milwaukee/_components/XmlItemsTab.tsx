"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CONTENT_SOURCE_LABEL,
  MISSING_LABEL,
  STATUS_LABEL,
  type SoftOneCategories,
  type XmlItemRow,
  type XmlItemStatus,
} from "@/lib/hdctool/milwaukee-admin-contract";
import { ratioLabel } from "@/lib/hdctool/milwaukee-admin-pricing";
import { cn } from "@/lib/utils";
import { money, num, read } from "./format";
import { Notice, PAGE_SIZE, TablePager, Tag, pageSlice, type Tone } from "./kit";
import { BulkBar } from "./BulkBar";
import { ItemSheet } from "./ItemSheet";

const STATUS_TONE: Record<XmlItemStatus, Tone> = { DRAFT: "neutral", ACTIVE: "ok", ARCHIVED: "wait" };

/**
 * «Μόνο στο XML»: φίλτρα, πίνακας με επιλογή, μαζικές ενέργειες και πλαϊνό
 * πάνελ. Η πρώτη λίστα έρχεται από τον server· μετά από κάθε αλλαγή
 * ξαναδιαβάζεται από το `/admin/milwaukee/data`.
 */
export function XmlItemsTab({
  initialItems,
  categories,
  categoriesError,
  canEdit,
  canErp,
}: {
  initialItems: XmlItemRow[];
  categories: SoftOneCategories | null;
  categoriesError: string | null;
  canEdit: boolean;
  canErp: boolean;
}) {
  const [items, setItems] = useState<XmlItemRow[]>(initialItems);
  const [xmlCategory, setXmlCategory] = useState("all");
  const [status, setStatus] = useState<XmlItemStatus | "all">("all");
  const [noCategory, setNoCategory] = useState(false);
  const [withDiscrepancies, setWithDiscrepancies] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  // Μόνο η τελευταία ανανέωση μετράει: μια παλιότερη απάντηση που φτάνει αργά αγνοείται.
  const latest = useRef(0);
  const reload = useCallback(async () => {
    const request = ++latest.current;
    setReloading(true);
    const r = await read<{ items: XmlItemRow[] }>("items");
    if (request !== latest.current) return;
    setReloading(false);
    if (r.ok) setItems(r.items);
    else toast.error(`Η ανανέωση της λίστας απέτυχε: ${r.error}`);
  }, []);

  const xmlCategories = useMemo(
    () =>
      [...new Set(items.map((i) => i.xmlCategory).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b, "el"),
      ),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (xmlCategory === "all" || i.xmlCategory === xmlCategory) &&
        (!noCategory || i.categoryPath == null) &&
        (!withDiscrepancies || i.discrepancyCount > 0) &&
        (!q ||
          i.alternativeCode.toLowerCase().includes(q) ||
          (i.xmlTitle ?? "").toLowerCase().includes(q) ||
          i.nameEl.toLowerCase().includes(q)),
    );
  }, [items, status, xmlCategory, noCategory, withDiscrepancies, query]);

  const counts = useMemo(
    () => ({
      draft: items.filter((i) => i.status === "DRAFT").length,
      active: items.filter((i) => i.status === "ACTIVE").length,
      publishable: items.filter((i) => i.publishable).length,
      discrepancies: items.filter((i) => i.discrepancyCount > 0).length,
    }),
    [items],
  );

  // Αλλαγή φίλτρου: πρώτη σελίδα και καθαρή επιλογή (αλλιώς μια μαζική ενέργεια
  // θα έπιανε γραμμές που δεν φαίνονται πια).
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
    setSelected(new Set());
  };
  // Μετά από ανανέωση η λίστα μπορεί να μίκρυνε: η σελίδα δεν ξεπερνά την τελευταία.
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageRows = pageSlice(filtered, currentPage);
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const tiles: Array<{ label: string; value: number; hint: string; active?: boolean; onClick?: () => void }> = [
    {
      label: "Πρόχειρα",
      value: counts.draft,
      hint: "θέλουν όνομα, κατηγορία και τιμή",
      active: status === "DRAFT",
      onClick: () => reset(() => setStatus(status === "DRAFT" ? "all" : "DRAFT")),
    },
    {
      label: "Ενεργά",
      value: counts.active,
      hint: "ενεργοποιημένα από το προσωπικό",
      active: status === "ACTIVE",
      onClick: () => reset(() => setStatus(status === "ACTIVE" ? "all" : "ACTIVE")),
    },
    { label: "Στο eshop", value: counts.publishable, hint: "ενεργά, διαθέσιμα, με τιμή και κατηγορία" },
    {
      label: "Με αποκλίσεις",
      value: counts.discrepancies,
      hint: "XML ≠ επίσημα Milwaukee",
      active: withDiscrepancies,
      onClick: () => reset(() => setWithDiscrepancies(!withDiscrepancies)),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px border border-k-line bg-k-line lg:grid-cols-4">
        {tiles.map((t) => {
          const body = (
            <>
              <span className="block text-[length:var(--fs-10)] font-medium uppercase tracking-[0.08em] text-k-text-4">
                {t.label}
              </span>
              <span className="numeral mt-1 block text-[length:var(--fs-21)] font-semibold leading-none text-k-ink">
                {num(t.value)}
              </span>
              <span className="mt-1 block text-[length:var(--fs-11)] text-k-text-4">{t.hint}</span>
            </>
          );
          return t.onClick ? (
            <button
              key={t.label}
              type="button"
              aria-pressed={t.active}
              onClick={t.onClick}
              className={cn(
                "bg-white px-4 py-3.5 text-left transition-colors hover:bg-k-surface-3",
                t.active && "bg-k-gold-tint shadow-[inset_0_-2px_0_var(--color-k-ink)]",
              )}
            >
              {body}
            </button>
          ) : (
            <div key={t.label} className="bg-white px-4 py-3.5">
              {body}
            </div>
          );
        })}
      </div>

      {categoriesError && (
        <Notice tone="warn">Οι κατηγορίες του SoftOne δεν φόρτωσαν ({categoriesError}): η επιλογή κατηγορίας δεν είναι διαθέσιμη.</Notice>
      )}

      <div className="space-y-3 border border-k-line bg-white p-3" role="region" aria-label="Φίλτρα προϊόντων μόνο-XML">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-k-text-4" aria-hidden />
            <Input
              value={query}
              onChange={(e) => reset(() => setQuery(e.target.value))}
              placeholder={`Αναζήτηση σε ${num(items.length)} προϊόντα (κωδικός, τίτλος XML, όνομα)…`}
              aria-label="Αναζήτηση"
              className="pl-9"
            />
          </div>
          <Button type="button" variant="outline" disabled={reloading} onClick={() => void reload()}>
            {reloading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            <span className="sr-only sm:not-sr-only">Ανανέωση</span>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={xmlCategory} onValueChange={(v) => reset(() => setXmlCategory(v))}>
            <SelectTrigger className="w-full" aria-label="Κατηγορία XML">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες οι κατηγορίες XML</SelectItem>
              {xmlCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => reset(() => setStatus(v as XmlItemStatus | "all"))}>
            <SelectTrigger className="w-full" aria-label="Κατάσταση">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλες οι καταστάσεις</SelectItem>
              <SelectItem value="DRAFT">{STATUS_LABEL.DRAFT}</SelectItem>
              <SelectItem value="ACTIVE">{STATUS_LABEL.ACTIVE}</SelectItem>
              <SelectItem value="ARCHIVED">{STATUS_LABEL.ARCHIVED}</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex min-h-9 cursor-pointer items-center gap-2 border border-k-line px-2.5">
            <Switch checked={noCategory} onCheckedChange={(v) => reset(() => setNoCategory(v))} />
            <span className="text-[length:var(--fs-12)] text-k-text-2">Χωρίς κατηγορία</span>
          </label>
          <label className="flex min-h-9 cursor-pointer items-center gap-2 border border-k-line px-2.5">
            <Switch checked={withDiscrepancies} onCheckedChange={(v) => reset(() => setWithDiscrepancies(v))} />
            <span className="text-[length:var(--fs-12)] text-k-text-2">Με αποκλίσεις</span>
          </label>
        </div>
      </div>

      {canEdit && selected.size > 0 && (
        <BulkBar
          ids={[...selected]}
          categories={categories}
          onClear={() => setSelected(new Set())}
          onDone={() => {
            setSelected(new Set());
            void reload();
          }}
        />
      )}

      <section className="border border-k-line bg-white" aria-label="Προϊόντα μόνο-XML">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-[length:var(--fs-12-5)] text-k-text-3">
            Κανένα προϊόν δεν ταιριάζει στα φίλτρα.
          </p>
        ) : (
          <>
            {/* ≥1024px: πίνακας σταθερής διάταξης με ενωμένες στήλες, χωρίς οριζόντια κύλιση. */}
            <table className="hidden w-full table-fixed text-left lg:table">
              <thead>
                <tr className="border-b border-k-line text-[length:var(--fs-10)] uppercase tracking-[0.06em] text-k-text-4">
                  {canEdit && (
                    <th className="w-10 px-3 py-2.5">
                      <Checkbox
                        checked={allOnPage}
                        onCheckedChange={(v) => pageRows.forEach((r) => toggle(r.id, v === true))}
                        aria-label="Επιλογή όλων της σελίδας"
                      />
                    </th>
                  )}
                  <th className="w-14 px-2 py-2.5">
                    <span className="sr-only">Φωτογραφία</span>
                  </th>
                  <th className="px-2 py-2.5 font-medium">Προϊόν</th>
                  <th className="w-44 px-2 py-2.5 font-medium">Τιμές</th>
                  <th className="w-44 px-2 py-2.5 font-medium xl:w-56">Κατηγορία SoftOne</th>
                  <th className="w-40 px-3 py-2.5 font-medium">Κατάσταση</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item) => (
                  // Το κλικ σε όλη τη γραμμή είναι ευκολία για το ποντίκι· για πληκτρολόγιο
                  // και αναγνώστες οθόνης ανοίγει το κουμπί του προϊόντος.
                  <tr
                    key={item.id}
                    className={cn(
                      "cursor-pointer border-b border-k-line align-top last:border-0 hover:bg-k-surface-3",
                      selected.has(item.id) && "bg-k-gold-tint",
                    )}
                    onClick={() => setOpenId(item.id)}
                  >
                    {canEdit && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={(v) => toggle(item.id, v === true)}
                          aria-label={`Επιλογή ${item.alternativeCode}`}
                        />
                      </td>
                    )}
                    <td className="px-2 py-2.5">
                      <Thumb image={item.image} />
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(item.id);
                        }}
                        aria-label={`Άνοιγμα ${item.alternativeCode}`}
                        className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-k-ink"
                      >
                        <ProductInfo item={item} />
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <Prices item={item} />
                    </td>
                    <td className="px-2 py-2.5">
                      <SoftOneCategory item={item} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusTags item={item} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* <1024px: κάρτες στοιβαγμένες αντί για οριζόντια κύλιση. */}
            <div className="lg:hidden">
              {canEdit && (
                <label className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-k-line px-4 text-[length:var(--fs-12)] text-k-text-3">
                  <Checkbox checked={allOnPage} onCheckedChange={(v) => pageRows.forEach((r) => toggle(r.id, v === true))} />
                  Επιλογή όλων της σελίδας
                </label>
              )}
              <ul className="divide-y divide-k-line">
                {pageRows.map((item) => (
                  <li key={item.id} className={cn("flex gap-1 py-1 pr-1 pl-2", selected.has(item.id) && "bg-k-gold-tint")}>
                    {canEdit && (
                      <label className="flex size-11 shrink-0 cursor-pointer items-start justify-center pt-3">
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={(v) => toggle(item.id, v === true)}
                          aria-label={`Επιλογή ${item.alternativeCode}`}
                        />
                      </label>
                    )}
                    {/* Το σώμα της κάρτας είναι το κουμπί· το checkbox είναι δίπλα, όχι μέσα του. */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Άνοιγμα ${item.alternativeCode}`}
                      onClick={() => setOpenId(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId(item.id);
                        }
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer gap-3 px-2 py-2 hover:bg-k-surface-3 focus-visible:bg-k-surface-3 focus-visible:outline-none"
                    >
                      <Thumb image={item.image} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <ProductInfo item={item} />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Prices item={item} />
                          <SoftOneCategory item={item} />
                        </div>
                        <StatusTags item={item} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        <TablePager page={currentPage} total={filtered.length} onPage={setPage} />
      </section>

      <ItemSheet
        key={openId ?? "closed"}
        itemId={openId}
        categories={categories}
        canEdit={canEdit}
        canErp={canErp}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        onChanged={() => void reload()}
      />
    </div>
  );
}

function Thumb({ image }: { image: string | null }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden border border-k-line bg-white">
      {image ? (
        // Φωτογραφίες από τον server του προμηθευτή· απλό <img>, χωρίς remotePatterns.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="max-h-10 max-w-10 object-contain" loading="lazy" />
      ) : (
        <span className="text-[length:var(--fs-11)] text-k-text-5">—</span>
      )}
    </div>
  );
}

/** Κωδικός Milwaukee, τίτλος XML (έως 2 γραμμές) και κατηγορία XML. */
function ProductInfo({ item }: { item: XmlItemRow }) {
  const title = item.xmlTitle ?? item.nameEl;
  return (
    // Μόνο <span>: μπαίνει και μέσα σε <button>.
    <span className="block min-w-0 space-y-0.5">
      <span className="block font-mono text-[length:var(--fs-11)] text-k-text-3">{item.alternativeCode}</span>
      <span className="line-clamp-2 break-words text-[length:var(--fs-12-5)] font-medium text-k-ink" title={title}>
        {title}
      </span>
      <span
        className="line-clamp-1 break-words text-[length:var(--fs-11)] text-k-text-4"
        title={item.xmlCategory ?? undefined}
      >
        {item.xmlCategory ?? "—"}
      </span>
    </span>
  );
}

/** Αγορά, PRICEW (με λόγο) και τιμή eshop, στοιβαγμένα με ετικέτες. */
function Prices({ item }: { item: XmlItemRow }) {
  const r = ratioLabel(item.priceW, item.costNet, item.utbl02);
  return (
    <div className="text-[length:var(--fs-12)]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        <dt className="text-k-text-3">Αγορά</dt>
        <dd className="numeral text-right">{money(item.costNet)}</dd>
        <dt className="text-k-text-3">PRICEW</dt>
        <dd className="numeral text-right">{money(item.priceW)}</dd>
        {r && <dd className="numeral col-span-2 text-right text-k-text-4">{r}</dd>}
        <dt className="text-k-text-3">Eshop</dt>
        <dd className="numeral text-right" title="Με ΦΠΑ">
          {money(item.eshopPrice)}
        </dd>
      </dl>
      {item.pricingMode === "SUGGESTED" && item.suggestedLevel === "all" && (
        <Tag tone="wait" className="mt-1">
          χαμηλή βεβαιότητα
        </Tag>
      )}
    </div>
  );
}

function SoftOneCategory({ item }: { item: XmlItemRow }) {
  return (
    <div className="min-w-0 text-[length:var(--fs-12)]">
      <p className="line-clamp-3 break-words text-k-ink" title={item.categoryPath ?? undefined}>
        {item.categoryPath ?? "—"}
      </p>
      {item.categoryPath && item.treeMissing && <p className="text-k-text-4">νέο στο eshop</p>}
    </div>
  );
}

/** Κατάσταση, πηγή περιεχομένου, SoftOne και αποκλίσεις. */
function StatusTags({ item }: { item: XmlItemRow }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        <Tag tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Tag>
        {item.contentSource && <Tag tone="outline">{CONTENT_SOURCE_LABEL[item.contentSource]}</Tag>}
        {item.mtrl != null && <Tag tone="info">SoftOne</Tag>}
        {item.discrepancyCount > 0 && <Tag tone="danger">{item.discrepancyCount} αποκλίσεις</Tag>}
      </div>
      {item.status === "DRAFT" && item.missing.length > 0 && (
        <p className="text-[length:var(--fs-11)] text-k-text-4">
          λείπει {item.missing.map((m) => MISSING_LABEL[m]).join(", ")}
        </p>
      )}
    </div>
  );
}
