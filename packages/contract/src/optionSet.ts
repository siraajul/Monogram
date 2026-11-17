import { LINE_PROPERTY } from "./constants";
import type { OptionSetDraft } from "./config";
import type { Option } from "./options";
import { isChoiceOption, safeRegex } from "./util";

export type OptionSetIssueCode =
  | "duplicate_option_id" | "duplicate_value_id" | "empty_label" | "duplicate_property_name" | "reserved_property_name"
  | "unknown_option" | "unknown_value" | "cycle"
  | "missing_font" | "missing_library" | "empty_choices"
  | "invalid_regex" | "invalid_limits" | "negative_price" | "missing_fee_mapping";

export interface OptionSetIssue {
  code: OptionSetIssueCode;
  message: string;
  optionId?: string;
  valueId?: string;
  conditionId?: string;
}

export interface OptionSetValidationContext {
  /** Ids of the shop's fonts. When given, every fontId used by the set must be in it. */
  knownFontIds?: ReadonlySet<string>;
  /** True when the shop already has a fee product with denomination variants (Part 07). */
  feeMappingAvailable?: boolean;
}

/**
 * Publish-time checks. Returns every problem found (empty array = publishable).
 * Pure: the caller supplies shop knowledge through `ctx`.
 */
export function validateOptionSet(draft: OptionSetDraft, ctx: OptionSetValidationContext = {}): OptionSetIssue[] {
  const issues: OptionSetIssue[] = [];
  const add = (issue: OptionSetIssue) => issues.push(issue);
  const byId = new Map<string, Option>();

  // Ids, labels, property names
  const names = new Map<string, string>();
  const reserved = new Set<string>(Object.values(LINE_PROPERTY));
  for (const o of draft.options) {
    if (byId.has(o.id)) add({ code: "duplicate_option_id", optionId: o.id, message: `Option id "${o.id}" is used twice.` });
    byId.set(o.id, o);
    if (o.label.trim() === "") add({ code: "empty_label", optionId: o.id, message: "An option has no label." });

    const name = `${o.hiddenFromCart ? "_" : ""}${o.label.trim()}`.toLowerCase();
    if (reserved.has(name)) add({ code: "reserved_property_name", optionId: o.id, message: `"${o.label}" is a reserved name.` });
    const clash = names.get(name);
    if (clash !== undefined) add({ code: "duplicate_property_name", optionId: o.id, message: `"${o.label}" has the same label as another option.` });
    names.set(name, o.id);

    if (isChoiceOption(o)) {
      const seen = new Set<string>();
      for (const v of o.values) {
        if (seen.has(v.id)) add({ code: "duplicate_value_id", optionId: o.id, valueId: v.id, message: `${o.label}: value id "${v.id}" is used twice.` });
        seen.add(v.id);
        if (v.label.trim() === "") add({ code: "empty_label", optionId: o.id, valueId: v.id, message: `${o.label}: a value has no label.` });
      }
      if (o.values.length === 0 && !(o.type === "clipart" && o.libraryId))
        add({ code: "empty_choices", optionId: o.id, message: `${o.label} has no choices.` });
      if (o.type === "font") {
        for (const v of o.values) {
          if (!v.fontId) add({ code: "missing_font", optionId: o.id, valueId: v.id, message: `${o.label}: "${v.label}" has no font.` });
        }
      }
      for (const v of o.values) {
        if (v.fontId && ctx.knownFontIds && !ctx.knownFontIds.has(v.fontId))
          add({ code: "missing_font", optionId: o.id, valueId: v.id, message: `${o.label}: font of "${v.label}" no longer exists.` });
      }
    }
  }

  // Per-option rules
  for (const o of draft.options) checkOptionRules(o, byId, add);

  // Conditions: references, then cycles among option-level conditions
  const deps = new Map<string, Set<string>>();
  for (const c of draft.conditions) {
    const target = byId.get(c.target.optionId);
    if (!target) {
      add({ code: "unknown_option", conditionId: c.id, message: `Condition "${c.id}" targets an option that does not exist.` });
    } else if (c.target.valueId !== undefined && !(isChoiceOption(target) && target.values.some((v) => v.id === c.target.valueId))) {
      add({ code: "unknown_value", conditionId: c.id, optionId: target.id, valueId: c.target.valueId, message: `Condition "${c.id}" targets a value that does not exist.` });
    }
    for (const clause of [...(c.when.all ?? []), ...(c.when.any ?? [])]) {
      if (clause.operator === "variant_is") continue;
      if (!clause.optionId || !byId.has(clause.optionId)) {
        add({ code: "unknown_option", conditionId: c.id, message: `Condition "${c.id}" refers to an option that does not exist.` });
      } else if (c.target.valueId === undefined && target) {
        // Value-level conditions read answers, which never depend on value visibility, so only
        // option-level conditions can form a cycle.
        deps.set(target.id, (deps.get(target.id) ?? new Set()).add(clause.optionId));
      }
    }
  }
  for (const cycle of findCycles(deps)) {
    add({ code: "cycle", optionId: cycle[0], message: `Conditions form a loop: ${cycle.join(" → ")} → ${cycle[0]}.` });
  }

  // Pricing needs a way to charge
  const priced = draft.options.some(hasPrice);
  const hasMap = Object.keys(draft.pricing.feeVariantMap ?? {}).length > 0;
  if (priced && draft.pricing.mode === "fee_product" && !hasMap && !ctx.feeMappingAvailable)
    add({ code: "missing_fee_mapping", message: "This set charges extra, but the shop has no fee product yet. Set up the fee product first." });

  return issues;
}

function checkOptionRules(o: Option, byId: Map<string, Option>, add: (i: OptionSetIssue) => void) {
  const bad = (code: OptionSetIssueCode, message: string) => add({ code, optionId: o.id, message: `${o.label}: ${message}` });
  const regexes = (src: string | undefined) => {
    if (src !== undefined && safeRegex(src) === null) bad("invalid_regex", `"${src}" is not a valid pattern.`);
  };
  const linked = (id: string | undefined, type: "font" | "colour") => {
    if (id === undefined) return;
    const target = byId.get(id);
    const ok = type === "font" ? target?.type === "font" : target?.type === "swatch";
    if (!ok) add({ code: "unknown_option", optionId: o.id, message: `${o.label}: linked ${type} option "${id}" does not exist or has the wrong type.` });
  };

  if (o.type === "text" || o.type === "textarea") {
    regexes(o.allowed);
    for (const rule of Object.values(o.perFontRules ?? {})) regexes(rule.allowed);
    linked(o.fontOptionId, "font");
    if (o.minLength !== undefined && o.minLength > o.maxLength) bad("invalid_limits", "minimum length is above the maximum.");
  } else if (o.type === "slots") {
    for (const rule of Object.values(o.text.perFontRules ?? {})) regexes(rule.allowed);
    linked(o.fontOptionId, "font");
    linked(o.colorOptionId, "colour");
    if (o.minFilled > o.slotCount) bad("invalid_limits", "minimum filled slots is above the slot count.");
    if (o.kinds.includes("icon") && !o.iconLibraryId) bad("missing_library", "icon slots need an icon library.");
  } else if (o.type === "number") {
    if (o.min > o.max) bad("invalid_limits", "minimum is above the maximum.");
  } else if (o.type === "checkbox") {
    if (o.minSelect !== undefined && o.maxSelect !== undefined && o.minSelect > o.maxSelect)
      bad("invalid_limits", "minimum selection is above the maximum.");
  }
  if (hasNegativePrice(o)) bad("negative_price", "prices cannot be negative.");
}

const priceFields = (o: Option): number[] => {
  const own: Array<number | undefined> = [];
  if (o.type === "text" || o.type === "textarea") own.push(o.pricePerChar);
  if (o.type === "slots") own.push(o.pricePerSlot);
  if (o.type === "upload") own.push(o.pricePerFile);
  if (isChoiceOption(o)) own.push(...o.values.map((v) => v.priceAdd));
  return own.filter((n): n is number => n !== undefined);
};
const hasPrice = (o: Option) => priceFields(o).some((n) => n > 0);
const hasNegativePrice = (o: Option) => priceFields(o).some((n) => n < 0);

/** Elementary cycles via DFS; each cycle is reported once (as its node list). */
function findCycles(deps: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const done = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const visit = (node: string) => {
    if (done.has(node)) return;
    if (onStack.has(node)) {
      cycles.push(stack.slice(stack.indexOf(node)));
      return;
    }
    stack.push(node);
    onStack.add(node);
    for (const next of deps.get(node) ?? []) visit(next);
    stack.pop();
    onStack.delete(node);
    done.add(node);
  };
  for (const node of deps.keys()) visit(node);
  return cycles;
}
