"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toggleCompare } from "@/lib/compare/actions";

/**
 * «Σύγκριση» on the HDC card (plp.html `.cmp`): a square box and a word.
 *
 * Same action and the same server-computed `selected` / `disabled` as the
 * Kolleris `CompareCheckbox`; only the look is the mockup's. When the server
 * refuses a pick, the reason replaces the word for a moment.
 */
export function HdcCompareCheckbox({
  slug,
  selected,
  disabled = false,
  label,
}: {
  slug: string;
  selected: boolean;
  disabled?: boolean;
  label: string;
}) {
  const t = useTranslations("product.CompareCheckbox");
  const [pending, startTransition] = useTransition();
  const [refused, setRefused] = useState<"full" | "wrong_scope" | null>(null);

  const toggle = () => {
    setRefused(null);
    startTransition(async () => {
      const result = await toggleCompare({ slug });
      if (!result.ok && (result.error === "full" || result.error === "wrong_scope")) {
        setRefused(result.error);
        setTimeout(() => setRefused(null), 2600);
      }
    });
  };

  const title = refused
    ? refused === "full"
      ? t("i_sygkrisi_choraei_4_proionta")
      : t("mono_proionta_tis_idias_katigorias")
    : disabled
      ? t("mono_proionta_tis_idias_katigorias_2")
      : selected
        ? t("afairesi_apo_ti_sygkrisi")
        : t("prosthiki_sti_sygkrisi");

  return (
    <button
      type="button"
      className="hdc-card-cmp"
      onClick={toggle}
      disabled={disabled || pending}
      aria-pressed={selected}
      title={title}
    >
      <i aria-hidden className={selected ? "on" : undefined} />
      {refused === "full" ? t("eos_4") : refused === "wrong_scope" ? t("alli_kat") : label}
    </button>
  );
}
