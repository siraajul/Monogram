import type { Answers, SlotItem } from "./answers";
import { LINE_PROPERTY } from "./constants";
import type { ProductConfig } from "./config";
import { selectedFontId } from "./validate";
import { evaluateVisibility, selectableValues } from "./visibility";
import {
  fontOptionFor, isChoiceOption, isFilledSlot, normalizeText, ownAnswer, resolveTextRule, valueById,
} from "./util";

export interface LinePropertyContext {
  /** Needed so `variant_is` conditions hide the same options here as in validate/priceFor. */
  variantGid: string;
  designId: string;
  token: string;
  previewUrl?: string;
  group: string;
  /** Public info about uploaded files, shown to the merchant (URL preferred over name). */
  uploads?: Record<string, { url?: string; name?: string }>;
}

/**
 * Cart line properties for the shopper's visible answers plus the system properties
 * (_design_id, _design_token, _preview, _set, _group). Hidden options and empty answers are omitted;
 * options with `hiddenFromCart` get a "_" prefix on their name. Slots become "Placement 1".."Placement N"
 * (empty slots are skipped, numbering keeps their position), e.g. `Text: PICKLE (Block, Green)`.
 */
export function toLineProperties(
  config: ProductConfig,
  answers: Answers,
  ctx: LinePropertyContext,
): Record<string, string> {
  const vis = evaluateVisibility(config, answers, ctx.variantGid);
  const props: Record<string, string> = {};

  for (const o of config.options) {
    if (!vis.options.has(o.id)) continue;
    const a = ownAnswer(answers, o.id);
    if (!a) continue;
    const prefix = o.hiddenFromCart ? "_" : "";
    const set = (name: string, value: string) => {
      if (value !== "") props[`${prefix}${name}`] = value;
    };

    if (a.type === "text" && (o.type === "text" || o.type === "textarea")) {
      const rule = resolveTextRule(o, o.perFontRules, selectedFontId(config, vis, answers, o.fontOptionId));
      set(o.label, normalizeText(a.text, rule.transform));
    } else if (a.type === "number" && o.type === "number") {
      set(o.label, String(a.value));
    } else if (a.type === "choice" && isChoiceOption(o)) {
      const selectable = selectableValues(vis, o.id);
      const labels = a.valueIds.flatMap((id) => {
        const v = valueById(o, id);
        return v && selectable.has(id) ? [v.label] : [];
      });
      set(o.label, labels.join(", "));
    } else if (a.type === "upload" && o.type === "upload") {
      const shown = a.uploadIds.map((id) => ctx.uploads?.[id]?.url ?? ctx.uploads?.[id]?.name ?? "");
      set(o.label, shown.every((s) => s !== "") ? shown.join(", ") : `${a.uploadIds.length} file${a.uploadIds.length === 1 ? "" : "s"}`);
    } else if (a.type === "slots" && o.type === "slots") {
      const fontOption = fontOptionFor(config, o.fontOptionId);
      const colorOption = o.colorOptionId ? config.options.find((x) => x.id === o.colorOptionId) : undefined;
      const defaultFont = selectedFontId(config, vis, answers, o.fontOptionId);
      a.items.forEach((item, i) => {
        if (!isFilledSlot(item)) return;
        const fontId = item.kind === "icon" ? undefined : (item.fontId ?? defaultFont);
        const rule = resolveTextRule({ maxLength: o.text.maxLength }, o.text.perFontRules, fontId);
        const details = item.kind === "icon" ? [] : [
          fontOption?.values.find((v) => v.fontId !== undefined && v.fontId === fontId)?.label,
          isChoiceOption(colorOption) ? valueById(colorOption, item.colorValueId)?.label : undefined,
        ].filter((x): x is string => !!x);
        set(`Placement ${i + 1}`, describeSlot(item, normalizeText(item.kind === "icon" ? "" : item.text, rule.transform), details));
      });
    }
  }

  props[LINE_PROPERTY.designId] = ctx.designId;
  props[LINE_PROPERTY.designToken] = ctx.token;
  if (ctx.previewUrl) props[LINE_PROPERTY.preview] = ctx.previewUrl;
  props[LINE_PROPERTY.set] = `${config.optionSetId}:v${config.version}`;
  props[LINE_PROPERTY.group] = ctx.group;
  return props;
}

function describeSlot(item: SlotItem, text: string, details: string[]): string {
  const kind = item.kind === "text" ? "Text" : item.kind === "letter" ? "Letter" : "Icon";
  const body = item.kind === "icon" ? item.name : text;
  return `${kind}: ${body}${details.length ? ` (${details.join(", ")})` : ""}`;
}
