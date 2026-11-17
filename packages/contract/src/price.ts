import type { Answers } from "./answers";
import type { ProductConfig } from "./config";
import { selectedFontId } from "./validate";
import { evaluateVisibility, selectableValues } from "./visibility";
import { charCount, isFilledSlot, normalizeText, ownAnswer, resolveTextRule } from "./util";

/**
 * Add-on total in shop-currency major units, rounded to cents and never negative.
 * Only visible options and currently selectable values are priced. Rules:
 *  - choice: sum of `priceAdd` of the selected values
 *  - text: `pricePerChar` x non-whitespace characters of the final (trimmed, transformed) text
 *  - slots: `pricePerSlot` x filled slots
 *  - upload: `pricePerFile` x uploaded files
 * Answers of the wrong type price as 0. Call `validate` first; this does not check limits.
 */
export function priceFor(config: ProductConfig, answers: Answers, variantGid: string): number {
  const vis = evaluateVisibility(config, answers, variantGid);
  let cents = 0;

  for (const o of config.options) {
    if (!vis.options.has(o.id)) continue;
    const a = ownAnswer(answers, o.id);
    if (!a) continue;

    if (a.type === "choice" && "values" in o) {
      const selectable = selectableValues(vis, o.id);
      for (const id of new Set(a.valueIds)) {
        const v = o.values.find((x) => x.id === id);
        if (v && selectable.has(id)) cents += toCents(v.priceAdd);
      }
    } else if (a.type === "text" && (o.type === "text" || o.type === "textarea")) {
      const rule = resolveTextRule(o, o.perFontRules, selectedFontId(config, vis, answers, o.fontOptionId));
      const text = normalizeText(a.text, rule.transform);
      cents += Math.round((o.pricePerChar ?? 0) * 100) * charCount(text.replace(/\s/gu, ""));
    } else if (a.type === "slots" && o.type === "slots") {
      cents += toCents(o.pricePerSlot) * a.items.filter(isFilledSlot).length;
    } else if (a.type === "upload" && o.type === "upload") {
      cents += toCents(o.pricePerFile) * new Set(a.uploadIds).size;
    }
  }
  return Math.max(0, cents) / 100;
}

const toCents = (major: number | undefined): number => Math.round((major ?? 0) * 100);
