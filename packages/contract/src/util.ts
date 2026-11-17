import type { Answers, AnswerValue, SlotItem } from "./answers";
import type { ChoiceOption, Option, OptionValue, TextOption } from "./options";

export type OptionsConfig = { options: Option[] };

/** Length in Unicode code points (so an emoji counts as 1, not 2). */
export function charCount(s: string): number {
  return Array.from(s).length;
}

export function findOption(config: OptionsConfig, id: string): Option | undefined {
  return config.options.find((o) => o.id === id);
}

export function isChoiceOption(o: Option | undefined): o is ChoiceOption {
  return !!o && ["dropdown", "radio", "checkbox", "swatch", "font", "clipart"].includes(o.type);
}

/** Own-property lookup so an option id like "__proto__" cannot read the prototype. */
export function ownAnswer(answers: Answers, optionId: string): AnswerValue | undefined {
  return Object.prototype.hasOwnProperty.call(answers, optionId) ? answers[optionId] : undefined;
}

type TextRule = NonNullable<TextOption["perFontRules"]>[string];

/** Per-font rules override the option's base rules field by field. */
export function resolveTextRule(
  base: { maxLength: number; allowed?: string; transform?: "none" | "upper" | "lower" },
  perFontRules: TextOption["perFontRules"],
  fontId: string | undefined,
): { maxLength: number; allowed: string | undefined; transform: "none" | "upper" | "lower" } {
  const rule: TextRule | undefined =
    fontId !== undefined && perFontRules && Object.prototype.hasOwnProperty.call(perFontRules, fontId)
      ? perFontRules[fontId]
      : undefined;
  return {
    maxLength: rule?.maxLength ?? base.maxLength,
    allowed: rule?.allowed ?? base.allowed,
    transform: rule?.transform ?? base.transform ?? "none",
  };
}

/** Trim, then apply the transform. Every consumer (validate, price, properties) sees this same text. */
export function normalizeText(text: string, transform: "none" | "upper" | "lower"): string {
  const t = text.trim();
  return transform === "upper" ? t.toUpperCase() : transform === "lower" ? t.toLowerCase() : t;
}

/** null when the pattern is not a valid regex (reported by validateOptionSet, ignored at runtime). */
export function safeRegex(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}

export function isFilledSlot(item: SlotItem | null | undefined): item is SlotItem {
  if (!item) return false;
  return item.kind === "icon" ? item.assetId !== "" : item.text.trim() !== "";
}

export function isEmptyAnswer(a: AnswerValue | undefined): boolean {
  if (!a) return true;
  switch (a.type) {
    case "text": return a.text.trim() === "";
    case "choice": return a.valueIds.length === 0;
    case "slots": return !a.items.some(isFilledSlot);
    case "upload": return a.uploadIds.length === 0;
    case "number": return false;
  }
}

/** The values to compare condition clauses against. */
export function answerStrings(a: AnswerValue | undefined): string[] {
  if (!a) return [];
  switch (a.type) {
    case "text": return a.text === "" ? [] : [a.text];
    case "choice": return a.valueIds;
    case "number": return [String(a.value)];
    case "upload": return a.uploadIds;
    case "slots":
      return a.items.filter(isFilledSlot).map((i) => (i.kind === "icon" ? i.assetId : i.text));
  }
}

/** Font option feeding a text/slots option: the explicit one, else the first font option. */
export function fontOptionFor(config: OptionsConfig, explicitId: string | undefined): ChoiceOption | undefined {
  const o = explicitId !== undefined ? findOption(config, explicitId) : config.options.find((x) => x.type === "font");
  return o && o.type === "font" ? o : undefined;
}

export function valueById(option: ChoiceOption | undefined, id: string | undefined): OptionValue | undefined {
  return option?.values.find((v) => v.id === id);
}
