import { normalizeModelText, parseModel, platformOf } from "./model";

/**
 * The five Milwaukee columns stored on `Product`, computed from the name.
 *
 * `parseModel` only matches a real tool code ("M18 FPD3-0X"); it returns null
 * for a bare platform mention ("ΤΣΟΚ Μ18 FPD2 …") or no platform at all. This
 * still fills `platform` and `isFuel` from the looser rules in that case, so
 * an accessory that merely fits a platform is still filterable by it, while
 * `modelRoot` / `modelContent` stay null — there is no tool code to group by.
 */
export function milwaukeeFields(name: string) {
  const model = parseModel(name);
  return {
    platform: model?.platform ?? platformOf(name),
    modelRoot: model?.root ?? null,
    modelContent: model?.content ?? null,
    isFuel: model?.fuel ?? /\bFUEL\b/.test(normalizeModelText(name)),
    isOneKey: model?.oneKey ?? false,
  };
}
