"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { Link, useRouter } from "@/i18n/navigation";
import {
  highlightParts,
  pushRecent,
  RECENT_SEARCHES_KEY,
  RECENT_SEARCHES_MAX,
} from "@/lib/catalog/search-query";
import {
  platformLabel,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_MIN_LENGTH,
  SUGGEST_PLATFORMS,
} from "@/lib/catalog/suggest-options";
import {
  EMPTY_SUGGEST,
  type SuggestModel,
  type SuggestResult,
  type SuggestTile,
  type SuggestVariant,
} from "@/lib/catalog/suggest-types";
import { formatPrice } from "@/lib/format";
import { upGreek } from "@/lib/greek";
import { displayName } from "@/lib/milwaukee/display";
import { LISTING_LIMITS } from "@/lib/catalog/listing-query";

/**
 * Search-as-you-type (search.html §1 and the phone frames).
 *
 * A typeahead cannot be server-rendered — it reacts to keystrokes — so this is
 * the one place a client island is the whole feature. Every row it draws is
 * data the server produced (`/api/suggest`); this owns the input, a debounce,
 * an abort controller, the highlight index and the per-device recent list.
 *
 *  - desktop: the header box widens to 520px with an ink ring, the page behind
 *    dims, and a 980px two-column panel drops from the header's bottom edge,
 *    right-aligned to the box
 *  - mobile: rendered inside the full-screen panel `MobileHeader` opens — a
 *    red bar with the field and ΑΚΥΡΟ, the same sections stacked below
 *
 * Races: the response is stored WITH the query it answers and read back only
 * while the two agree, so a late reply for "fp" can never overwrite "fpd3".
 * Keyboard: ↑ ↓ through every row, Enter opens, Esc closes.
 */
export function SearchSuggest({
  locale,
  variant = "desktop",
  packoutHref = "/anazitisi?q=PACKOUT",
  onClose,
}: {
  locale: string;
  variant?: "desktop" | "mobile";
  /** Where the PACKOUT chip goes — the header resolves it from the menu. */
  packoutHref?: string;
  /** Mobile: closes the full-screen panel (ΑΚΥΡΟ, Esc, after navigating). */
  onClose?: () => void;
}) {
  const t = useTranslations("chrome.SearchSuggest");
  const router = useRouter();
  const listId = useId();
  const desktop = variant === "desktop";

  const [query, setQuery] = useState("");
  // The mobile panel is only mounted while open.
  const [open, setOpen] = useState(!desktop);
  const [mark, setMark] = useState<{ q: string; index: number }>({ q: "", index: -1 });
  const [entry, setEntry] = useState<{ q: string; result: SuggestResult } | null>(null);
  // Read on first focus (desktop, server-rendered) or at mount (the phone
  // panel only ever mounts in the browser, after a tap).
  const [recent, setRecent] = useState<string[] | null>(() => (desktop ? null : readRecent()));
  const [popular, setPopular] = useState<SuggestTile[] | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  const trimmed = query.trim();
  const typed = trimmed.length >= SUGGEST_MIN_LENGTH;
  const fresh = entry?.q === trimmed ? entry.result : null;
  // While the next answer is on its way the last one stays up: no flicker.
  const data = typed ? (fresh ?? entry?.result ?? null) : null;
  const loading = typed && fresh == null;
  const cursor = mark.q === trimmed ? mark.index : -1;
  const setCursor = (next: number | ((i: number) => number)) =>
    setMark((m) => {
      const from = m.q === trimmed ? m.index : -1;
      return { q: trimmed, index: typeof next === "function" ? next(from) : next };
    });

  const root = useRef<HTMLDivElement | null>(null);
  const form = useRef<HTMLFormElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  // ── Recent searches: this browser only, and never fatal ────────────────
  const loadRecent = () => {
    if (recent == null) setRecent(readRecent());
  };
  const saveRecent = (next: string[]) => {
    setRecent(next);
    try {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
      /* private mode, full quota: the list simply is not kept */
    }
  };
  const remember = (q: string) => {
    if (q.trim().length >= SUGGEST_MIN_LENGTH) saveRecent(pushRecent(recent ?? [], q));
  };

  // ── Empty focus: recent (local) and popular (fetched once) ─────────────
  useEffect(() => {
    if (!open || popular != null) return;
    const controller = new AbortController();
    fetch(`/api/suggest?popular=1&locale=${locale}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { popular?: SuggestTile[] }) => setPopular(body.popular ?? []))
      .catch((error) => {
        if (error.name !== "AbortError") setPopular([]);
      });
    return () => controller.abort();
  }, [open, popular, locale]);

  // ── Fetch, debounced and abortable ──────────────────────────────────────
  useEffect(() => {
    if (!typed || fresh != null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(trimmed)}&locale=${locale}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((result: SuggestResult) => setEntry({ q: trimmed, result }))
        .catch((error) => {
          if (error.name === "AbortError") return;
          /* Typing faster than the rate limit (429): the last answer stays on
             screen rather than a "nothing found" that is not true. Otherwise
             an empty result for this query beats spinning forever. */
          setEntry((previous) =>
            error.message === "429" && previous
              ? { q: trimmed, result: previous.result }
              : { q: trimmed, result: EMPTY_SUGGEST(trimmed) },
          );
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, typed, fresh, locale]);

  // ── Desktop: close on outside click, size the panel ─────────────────────
  useEffect(() => {
    if (!open || !desktop) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    /* 980px, right-aligned to the box — narrower only when the window is. */
    const measure = () => {
      const right = form.current?.getBoundingClientRect().right ?? 0;
      setWidth(Math.max(320, Math.min(980, Math.round(right) - 24)));
    };
    measure();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", measure);
    };
  }, [open, desktop]);

  const close = useCallback(() => {
    setMark({ q: "", index: -1 });
    if (desktop) {
      setOpen(false);
      input.current?.blur();
    } else {
      onClose?.();
    }
  }, [desktop, onClose]);

  const go = (href: string, remembered = trimmed) => {
    remember(remembered);
    close();
    router.push(href);
  };

  const searchHref = (q: string, platform?: string) => {
    const params = new URLSearchParams({ q });
    if (platform) params.set("platform", platform);
    return `/anazitisi?${params.toString()}`;
  };

  /*
   * Every row the arrow keys can land on, in visual order. Derived during
   * render, so the cursor can never point at a row that is gone.
   */
  type Item = { key: string; href: string; remember?: string };
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    if (!typed) {
      for (const q of recent ?? []) out.push({ key: `recent:${q}`, href: searchHref(q), remember: q });
      for (const p of (popular ?? []).slice(0, desktop ? 4 : 3))
        out.push({ key: `pop:${p.id}`, href: `/proion/${p.slug}` });
      return out;
    }
    if (!data) return out;
    if (data.exact) out.push({ key: "exact", href: `/proion/${data.exact.slug}` });
    for (const s of data.siblings) out.push({ key: `sib:${s.slug}`, href: `/proion/${s.slug}` });
    for (const m of data.models) out.push({ key: `model:${m.root}`, href: `/proion/${m.slug}` });
    for (const a of data.accessories) out.push({ key: `acc:${a.id}`, href: `/proion/${a.slug}` });
    for (const r of data.didYouMean) out.push({ key: `dym:${r}`, href: searchHref(r), remember: r });
    for (const c of data.categories) out.push({ key: `cat:${c.slug}`, href: `/katalogos/${c.slug}` });
    if (data.totalProducts > 0) out.push({ key: "all", href: searchHref(data.query) });
    return out;
  }, [typed, data, recent, popular, desktop]);

  const indexOf = (key: string) => items.findIndex((i) => i.key === key);
  const option = (key: string) => {
    const i = indexOf(key);
    return {
      id: `${listId}-${i}`,
      role: "option" as const,
      "aria-selected": cursor === i,
      "data-active": cursor === i ? ("true" as const) : undefined,
      onMouseEnter: () => setCursor(i),
    };
  };

  // Keep the highlighted row in view (the phone panel and a short window scroll).
  useEffect(() => {
    if (cursor < 0) return;
    document.getElementById(`${listId}-${cursor}`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, listId]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!open) setOpen(true);
    if (items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((i) => (i + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === "Enter" && cursor >= 0 && items[cursor]) {
      // Only with a row highlighted — otherwise Enter submits to the results.
      event.preventDefault();
      const item = items[cursor];
      go(item.href, item.remember ?? trimmed);
    }
  };

  const removeRecent = (q: string) => saveRecent((recent ?? []).filter((x) => x !== q));

  const showPanel = open;
  const placeholder = desktop ? t("hdc_placeholder") : t("placeholder_mobile");

  const field = (
    <form
      ref={form}
      role="search"
      aria-label={t("anazitisi_proionton")}
      /*
       * `action` is the no-JavaScript fallback (the Greek results page); with
       * JavaScript the locale-aware router takes over, so an English visitor
       * stays in English.
       */
      action="/anazitisi"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed) return;
        go(searchHref(trimmed));
      }}
      className={desktop ? "hdc-search" : "hdc-msg-field"}
    >
      <label htmlFor={`q-${variant}`} className="sr-only">
        {t("anazitisi")}
      </label>
      <input
        ref={input}
        id={`q-${variant}`}
        name="q"
        type="search"
        maxLength={LISTING_LIMITS.maxQueryLength}
        enterKeyHint="search"
        data-search-input
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={cursor >= 0 ? `${listId}-${cursor}` : undefined}
        autoComplete="off"
        autoFocus={!desktop}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          loadRecent();
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      {desktop && (
        <button type="submit" aria-label={t("anazitisi")}>
          <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
            <circle cx="10.5" cy="10.5" r="7" />
            <line x1="15.8" y1="15.8" x2="22" y2="22" />
          </svg>
        </button>
      )}
    </form>
  );

  const body = (
    <Panel
      layout={variant}
      t={t}
      listId={listId}
      typed={typed}
      data={data}
      loading={loading}
      recent={recent ?? []}
      popular={popular}
      packoutHref={packoutHref}
      option={option}
      go={go}
      searchHref={searchHref}
      removeRecent={removeRecent}
      pickQuery={(q) => {
        setQuery(q);
        input.current?.focus();
      }}
    />
  );

  const live = (
    <span aria-live="polite" className="sr-only">
      {data && !loading ? t("apotelesmata_gia", { totalProducts: data.totalProducts, query: data.query }) : ""}
    </span>
  );

  if (!desktop) {
    return (
      <div ref={root} className="hdc-msg" role="dialog" aria-modal="true" aria-label={t("anazitisi")}>
        <div className="hdc-msg-bar">
          {field}
          <button type="button" className="hdc-msg-cancel" onClick={close}>
            {upGreek(t("akyro"))}
          </button>
        </div>
        {live}
        <div id={listId} role="listbox" aria-label={t("protaseis_anazitisis")} className="hdc-msg-body">
          {body}
        </div>
      </div>
    );
  }

  return (
    <div ref={root} className="hdc-sg" data-open={showPanel ? "true" : undefined}>
      {field}
      {live}
      {showPanel && (
        <>
          <div className="hdc-sg-dim" aria-hidden onMouseDown={close} />
          <div
            id={listId}
            role="listbox"
            aria-label={t("protaseis_anazitisis")}
            aria-busy={loading || undefined}
            className="hdc-sg-dd"
            style={width ? { width } : undefined}
          >
            {body}
          </div>
          <p className="hdc-sg-kbd" aria-hidden>
            {t("kbd_nav")} <b>↑</b>
            <b>↓</b> · {t("kbd_open")} <b>Enter</b> · {t("kbd_close")} <b>Esc</b>
          </p>
        </>
      )}
    </div>
  );
}

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((x): x is string => typeof x === "string").slice(0, RECENT_SEARCHES_MAX)
      : [];
  } catch {
    return [];
  }
}

type T = ReturnType<typeof useTranslations<"chrome.SearchSuggest">>;
type OptionProps = (key: string) => {
  id: string;
  role: "option";
  "aria-selected": boolean;
  "data-active": "true" | undefined;
  onMouseEnter: () => void;
};

/** The panel's content — two columns on desktop, stacked on the phone. */
function Panel({
  layout,
  t,
  typed,
  data,
  loading,
  recent,
  popular,
  packoutHref,
  option,
  go,
  searchHref,
  removeRecent,
  pickQuery,
}: {
  layout: "desktop" | "mobile";
  t: T;
  listId: string;
  typed: boolean;
  data: SuggestResult | null;
  loading: boolean;
  recent: string[];
  popular: SuggestTile[] | null;
  packoutHref: string;
  option: OptionProps;
  go: (href: string, remembered?: string) => void;
  searchHref: (q: string, platform?: string) => string;
  removeRecent: (q: string) => void;
  pickQuery: (q: string) => void;
}) {
  const locale = useLocale();
  const desktop = layout === "desktop";
  const price = (net: number | null, vatRate: number) =>
    net != null ? formatPrice(net, locale, { vatRate }) : "—";

  // ── Empty focus ─────────────────────────────────────────────────────────
  if (!typed) {
    const recentBlock = recent.length > 0 && (
      <section>
        <h4 className="hdc-sg-h">{upGreek(t("prosfates"))}</h4>
        <div className="hdc-sg-recent">
          {recent.map((q) => (
            <div key={q} className="hdc-sg-recent-row" {...option(`recent:${q}`)}>
              <a
                href={searchHref(q)}
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault();
                  go(searchHref(q), q);
                }}
              >
                {q}
              </a>
              <button
                type="button"
                aria-label={t("afairesi", { query: q })}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => removeRecent(q)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>
    );
    const platformBlock = (
      <section>
        <h4 className="hdc-sg-h">{upGreek(t("platformes"))}</h4>
        <div className="hdc-sg-chips">
          {SUGGEST_PLATFORMS.map((p) => (
            <Link
              key={p}
              href={searchHref(platformLabel(p))}
              onClick={(e) => {
                e.preventDefault();
                go(searchHref(platformLabel(p)), "");
              }}
            >
              {platformLabel(p)}
            </Link>
          ))}
          <Link
            href={packoutHref}
            onClick={(e) => {
              e.preventDefault();
              go(packoutHref, "");
            }}
          >
            PACKOUT
          </Link>
        </div>
      </section>
    );
    const shown = (popular ?? []).slice(0, desktop ? 4 : 3);
    const popularBlock = shown.length > 0 && (
      <section>
        <h4 className="hdc-sg-h">{upGreek(t("dimofili"))}</h4>
        {desktop ? (
          <div className="hdc-sg-acc">
            {shown.map((p) => (
              <Tile key={p.id} tile={p} tokens={[]} price={price} option={option(`pop:${p.id}`)} go={go} />
            ))}
          </div>
        ) : (
          shown.map((p) => (
            <Mini
              key={p.id}
              href={`/proion/${p.slug}`}
              image={p.image}
              title={p.name}
              price={price(p.priceNet, p.vatRate)}
              option={option(`pop:${p.id}`)}
              go={go}
            />
          ))
        )}
      </section>
    );

    if (!desktop) {
      return (
        <div className="hdc-sg-stack">
          {recentBlock}
          {platformBlock}
          {popularBlock}
        </div>
      );
    }
    return (
      <div className="hdc-sg-grid">
        <div className="hdc-sg-l">
          {recentBlock}
          {popularBlock}
          {!recentBlock && !popularBlock && <p className="hdc-sg-hint">{t("grigora_text")}</p>}
        </div>
        <div className="hdc-sg-r">
          {platformBlock}
          <QuickHint t={t} />
        </div>
      </div>
    );
  }

  // ── Typed, first answer still on its way ─────────────────────────────────
  if (!data) {
    return (
      <div className={desktop ? "hdc-sg-grid" : "hdc-sg-stack"}>
        <div className="hdc-sg-l">
          <SuggestSkeleton />
        </div>
      </div>
    );
  }

  const { tokens } = data;
  const nothing = data.totalProducts === 0 && !data.exact;

  const exactBlock = data.exact && (
    <section>
      <h4 className="hdc-sg-h">{upGreek(t("akrivis_kodikos"))}</h4>
      <div className="hdc-sg-exact" {...option("exact")}>
        <Link
          href={`/proion/${data.exact.slug}`}
          className="hdc-sg-exact-main"
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            go(`/proion/${data.exact!.slug}`);
          }}
        >
          <span className="hdc-sg-img hdc-sg-img--90">
            {data.exact.image ? <Image src={data.exact.image} alt="" width={120} height={120} /> : null}
          </span>
          <span>
            <b>{displayName(data.exact.name, data.exact.mpn)}</b>
            <small>
              <mark>{data.exact.sku}</mark>
              {data.exact.variant && ` · ${contentLabel(t, data.exact.variant, true)}`}
            </small>
            <span className="hdc-sg-price">{price(data.exact.priceNet, data.exact.vatRate)}</span>
            <Availability
              t={t}
              inStock={data.exact.inStock}
              supplierAvailable={data.exact.supplierAvailable}
            />
          </span>
        </Link>
        <QtyAdd t={t} productId={data.exact.id} disabled={data.exact.priceNet == null} />
      </div>
    </section>
  );

  const siblingsBlock = data.siblings.length > 0 && (
    <section>
      <h4 className="hdc-sg-h">{upGreek(t("to_idio_montelo"))}</h4>
      {data.siblings.map((s) => (
        <Mini
          key={s.slug}
          href={`/proion/${s.slug}`}
          image={s.image}
          title={`${s.code} — ${contentLabel(t, s.variant, true)}`}
          price={price(s.variant.priceNet, s.variant.vatRate)}
          option={option(`sib:${s.slug}`)}
          go={go}
        />
      ))}
    </section>
  );

  const modelsBlock = data.models.length > 0 && (
    <section>
      <h4 className="hdc-sg-h">
        {upGreek(t("modela"))}
        <span>{data.models.length}</span>
      </h4>
      <div>
        {data.models.map((model, i) => (
          <ModelRow
            key={model.root}
            t={t}
            model={model}
            tokens={tokens}
            first={i === 0}
            price={price}
            option={option(`model:${model.root}`)}
            go={go}
          />
        ))}
      </div>
    </section>
  );

  const accessoriesBlock = data.accessories.length > 0 && (
    <section>
      <h4 className="hdc-sg-h">
        {upGreek(t("axesouar"))}
        <span>{data.accessories.length}</span>
      </h4>
      {desktop ? (
        <div className="hdc-sg-acc">
          {data.accessories.map((a) => (
            <Tile key={a.id} tile={a} tokens={tokens} price={price} option={option(`acc:${a.id}`)} go={go} />
          ))}
        </div>
      ) : (
        data.accessories.map((a) => (
          <Mini
            key={a.id}
            href={`/proion/${a.slug}`}
            image={a.image}
            title={<Marked text={a.name} tokens={tokens} />}
            price={price(a.priceNet, a.vatRate)}
            option={option(`acc:${a.id}`)}
            go={go}
          />
        ))
      )}
    </section>
  );

  const nothingBlock = nothing && !loading && (
    <section className="hdc-sg-none">
      <p className="hdc-sg-none-t">{upGreek(t("den_vrikame", { query: data.query }))}</p>
      <p>{t("den_vrikame_text")}</p>
      {data.didYouMean.length > 0 && (
        <>
          <h4 className="hdc-sg-h">{upGreek(t("mipos_ennoeite"))}</h4>
          <div className="hdc-sg-chips">
            {data.didYouMean.map((r, i) => (
              <button
                key={r}
                type="button"
                className={i === 0 ? "is-red" : undefined}
                {...option(`dym:${r}`)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickQuery(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );

  const categoriesBlock = data.categories.length > 0 && (
    <section>
      <h4 className="hdc-sg-h">{upGreek(t("katigories"))}</h4>
      <div>
        {data.categories.map((c) => (
          <Link prefetch={false}
            key={c.slug}
            href={`/katalogos/${c.slug}`}
            className="hdc-sg-row"
            tabIndex={-1}
            {...option(`cat:${c.slug}`)}
            onClick={(e) => {
              e.preventDefault();
              go(`/katalogos/${c.slug}`);
            }}
          >
            <Marked text={c.name} tokens={tokens} />
            <span aria-hidden>›</span>
          </Link>
        ))}
      </div>
    </section>
  );

  const platformsBlock = data.platforms.length > 0 && (
    <section>
      <h4 className="hdc-sg-h">{upGreek(t("platforma"))}</h4>
      <div className="hdc-sg-chips">
        {data.platforms.map((p) => (
          <Link
            key={p}
            href={searchHref(data.query, p)}
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();
              go(searchHref(data.query, p));
            }}
          >
            {platformLabel(p)}
          </Link>
        ))}
      </div>
    </section>
  );

  const allBar = data.totalProducts > 0 && (
    <Link
      href={searchHref(data.query)}
      className="hdc-sg-all"
      tabIndex={-1}
      {...option("all")}
      onClick={(e) => {
        e.preventDefault();
        go(searchHref(data.query));
      }}
    >
      {upGreek(t("ola_gia", { query: data.query }))} →
      <span>{t("n_proionta", { count: data.totalProducts })}</span>
    </Link>
  );

  if (!desktop) {
    return (
      <div className="hdc-sg-stack" aria-busy={loading || undefined}>
        {exactBlock}
        {siblingsBlock}
        {modelsBlock}
        {accessoriesBlock}
        {nothingBlock}
        {categoriesBlock}
        {platformsBlock}
        {allBar}
      </div>
    );
  }

  return (
    <div className="hdc-sg-grid">
      <div className="hdc-sg-l">
        {exactBlock}
        {siblingsBlock}
        {modelsBlock}
        {accessoriesBlock}
        {nothingBlock}
      </div>
      <div className="hdc-sg-r">
        {categoriesBlock}
        {platformsBlock}
        <QuickHint t={t} />
      </div>
      {allBar}
    </div>
  );
}

function QuickHint({ t }: { t: T }) {
  return (
    <section>
      <h4 className="hdc-sg-h">{upGreek(t("grigora"))}</h4>
      <p className="hdc-sg-hint">{t("grigora_text")}</p>
    </section>
  );
}

/** "Σκέτο" / "Κιτ 2 × 5.0Ah" — what tells the variants of one model apart. */
function contentLabel(t: T, v: SuggestVariant, long = false): string {
  if (v.content === "bare") return long ? t("sketo_ergaleio") : t("sketo");
  if (v.kit) return t("kit_mpataries", { count: v.kit.batteries, ah: v.kit.ah.toFixed(1) });
  return v.suffix ? t("kit_suffix", { suffix: v.suffix }) : t("kit");
}

/** Ours «Σε απόθεμα»; the supplier's «3–5 εργάσιμες»; neither «1–3 εργάσιμες». */
function Availability({
  t,
  inStock,
  supplierAvailable,
}: {
  t: T;
  inStock: boolean;
  supplierAvailable: boolean;
}) {
  return (
    <span className={`hdc-sg-avail ${inStock ? "is-ok" : "is-wait"}`}>
      ● {inStock ? t("se_apothema") : supplierAvailable ? t("ergasimes_3_5") : t("ergasimes")}
    </span>
  );
}

function Marked({ text, tokens }: { text: string; tokens: string[][] }) {
  const parts = highlightParts(text, tokens);
  return (
    <>
      {parts.map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
    </>
  );
}

function ModelRow({
  t,
  model,
  tokens,
  first,
  price,
  option,
  go,
}: {
  t: T;
  model: SuggestModel;
  tokens: string[][];
  first: boolean;
  price: (net: number | null, vatRate: number) => string;
  option: ReturnType<OptionProps>;
  go: (href: string) => void;
}) {
  const href = `/proion/${model.slug}`;
  return (
    <div
      className={`hdc-sg-model${first ? " is-first" : ""}`}
      {...option}
      onClick={() => go(href)}
    >
      <span className="hdc-sg-img">
        {model.image ? <Image src={model.image} alt="" width={96} height={96} /> : null}
      </span>
      <span className="hdc-sg-model-main">
        <Link
          href={href}
          className="hdc-sg-model-n"
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            go(href);
          }}
        >
          {model.tag && <span className="hdc-slant">{model.tag}</span>}
          <Marked text={model.root} tokens={tokens} />
        </Link>
        <span className="hdc-sg-model-v">
          {model.variants.map((v) => (
            <Link
              key={v.id}
              href={`/proion/${v.slug}`}
              tabIndex={-1}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                go(`/proion/${v.slug}`);
              }}
            >
              {contentLabel(t, v)}
              <b>{price(v.priceNet, v.vatRate)}</b>
            </Link>
          ))}
        </span>
      </span>
      <Availability t={t} inStock={model.inStock} supplierAvailable={model.supplierAvailable} />
    </div>
  );
}

function Tile({
  tile,
  tokens,
  price,
  option,
  go,
}: {
  tile: SuggestTile;
  tokens: string[][];
  price: (net: number | null, vatRate: number) => string;
  option: ReturnType<OptionProps>;
  go: (href: string) => void;
}) {
  const href = `/proion/${tile.slug}`;
  return (
    <Link
      href={href}
      className="hdc-sg-tile"
      tabIndex={-1}
      {...option}
      onClick={(e) => {
        e.preventDefault();
        go(href);
      }}
    >
      <span className="hdc-sg-tile-im">
        {tile.image ? <Image src={tile.image} alt="" width={96} height={96} /> : null}
      </span>
      <b>
        <Marked text={tile.name} tokens={tokens} />
      </b>
      <span>{price(tile.priceNet, tile.vatRate)}</span>
    </Link>
  );
}

function Mini({
  href,
  image,
  title,
  price,
  option,
  go,
}: {
  href: string;
  image: string | null;
  title: React.ReactNode;
  price: string;
  option: ReturnType<OptionProps>;
  go: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      className="hdc-sg-mini"
      tabIndex={-1}
      {...option}
      onClick={(e) => {
        e.preventDefault();
        go(href);
      }}
    >
      <span className="hdc-sg-img hdc-sg-img--56">
        {image ? <Image src={image} alt="" width={80} height={80} /> : null}
      </span>
      <b>{title}</b>
      <span>{price}</span>
    </Link>
  );
}

/** − 1 + and ΣΤΟ ΚΑΛΑΘΙ: the exact hit goes in the basket without opening it. */
function QtyAdd({ t, productId, disabled }: { t: T; productId: string; disabled: boolean }) {
  const [qty, setQty] = useState(1);
  return (
    <div className="hdc-sg-qa" onClick={(e) => e.stopPropagation()}>
      <div className="hdc-sg-qty" role="group" aria-label={t("posotita")}>
        <button
          type="button"
          aria-label={t("ligotera")}
          disabled={qty <= 1}
          onClick={() => setQty((q) => Math.max(1, q - 1))}
        >
          −
        </button>
        <span aria-live="polite">{qty}</span>
        <button
          type="button"
          aria-label={t("perissotera")}
          disabled={qty >= 99}
          onClick={() => setQty((q) => Math.min(99, q + 1))}
        >
          +
        </button>
      </div>
      <AddToCartButton productId={productId} quantity={qty} disabled={disabled} className="hdc-sg-add" />
    </div>
  );
}

function SuggestSkeleton() {
  return (
    <div className="hdc-sg-skel" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i}>
          <i />
          <i />
        </span>
      ))}
    </div>
  );
}
