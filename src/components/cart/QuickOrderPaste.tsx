"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { addSkusToCart } from "@/lib/cart/actions";
import { upGreek } from "@/lib/greek";

/**
 * «ΞΕΡΕΤΕ ΤΟΝ ΚΩΔΙΚΟ;» — paste Milwaukee codes (checkout.html `.quick`).
 *
 * The technician who knows the 4933… number does not browse the catalogue for
 * it. The box is a one-row textarea rather than an input: a column pasted from
 * a spreadsheet keeps its line breaks, which an `<input>` would flatten into
 * one unknown code. Enter adds, Shift+Enter starts a new line.
 *
 * Reports back exactly which codes were not found. Silently dropping unknown
 * codes from a 40-line paste is how an order ships short and nobody notices.
 */
export function QuickOrderPaste() {
  const t = useTranslations("cart.QuickOrderPaste");
  const form = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { added: number; notFound: string[] } | { error: string } | null
  >(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(async () => {
      const response = await addSkusToCart({ text });
      if (response.ok) {
        setResult({ added: response.added ?? 0, notFound: response.notFound ?? [] });
        setText("");
      } else {
        setResult({
          error:
            response.error === "no_matches"
              ? t("kanenas_apo_toys_kodikoys_den")
              : t("den_itan_dynati_i_prosthiki"),
        });
      }
    });
  };

  return (
    <div className="hdc-cart-quick">
      <div>
        <h3>{t("xerete_ton_kodiko")}</h3>
        <p>{t("epikolliste_kodikous_milwaukee")}</p>
      </div>

      <form ref={form} onSubmit={submit} className="box">
        <label htmlFor="sku-paste" className="sr-only">
          {t("kodikoi_proionton")}
        </label>
        <textarea
          id="sku-paste"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              form.current?.requestSubmit();
            }
          }}
          placeholder="4933479859"
          spellCheck={false}
        />
        <button type="submit" disabled={pending || !text.trim()}>
          {pending ? "…" : upGreek(t("prosthiki"))}
        </button>
      </form>

      {result && (
        <div role="status" className="res">
          {"error" in result ? (
            <p className="err">{result.error}</p>
          ) : (
            <>
              {result.added > 0 && (
                <p className="ok">
                  {t("prostethikan")} {result.added}{" "}
                  {result.added === 1 ? t("kodikos") : t("kodikoi")}.
                </p>
              )}
              {result.notFound.length > 0 && (
                <p className="wait">
                  {t("den_vrethikan")} {result.notFound.join(", ")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
