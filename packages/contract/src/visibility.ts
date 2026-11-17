import type { Answers, AnswerValue } from "./answers";
import type { Clause, Condition, ConditionGroup } from "./conditions";
import type { Option } from "./options";
import { answerStrings, isChoiceOption, isEmptyAnswer, ownAnswer, type OptionsConfig } from "./util";

export interface VisibilityConfig extends OptionsConfig {
  conditions: Condition[];
}

export interface Visibility {
  /** Ids of options currently shown. */
  options: Set<string>;
  /** For each shown choice option, the ids of the values currently selectable. */
  values: Map<string, Set<string>>;
}

/**
 * Evaluates every show/hide condition.
 *  - An option/value with any `show` condition is hidden until one matches; a matching `hide` always wins.
 *  - A clause reads the answer of the option it names; if that option is hidden its answer counts as empty.
 *  - Options are resolved depth-first, so a condition may refer to an option that comes later in the list.
 *    A circular config (rejected by validateOptionSet) hides the options on the cycle instead of looping.
 *  - An empty group (no clauses) never matches.
 */
export function evaluateVisibility(config: VisibilityConfig, answers: Answers, variantGid: string): Visibility {
  const byId = new Map<string, Option>(config.options.map((o) => [o.id, o]));
  const optionConds = new Map<string, Condition[]>();
  const valueConds = new Map<string, Condition[]>(); // key: `${optionId}\u0000${valueId}`
  for (const c of config.conditions) {
    const isValue = c.target.valueId !== undefined;
    const key = isValue ? `${c.target.optionId}\u0000${c.target.valueId}` : c.target.optionId;
    const map = isValue ? valueConds : optionConds;
    map.set(key, [...(map.get(key) ?? []), c]);
  }

  const memo = new Map<string, boolean>();
  const inProgress = new Set<string>();

  const decide = (conds: Condition[] | undefined): boolean => {
    const list = conds ?? [];
    const shows = list.filter((c) => c.action === "show");
    const hides = list.filter((c) => c.action === "hide");
    const shown = shows.length === 0 || shows.some((c) => groupMatches(c.when));
    return shown && !hides.some((c) => groupMatches(c.when));
  };

  const isVisible = (id: string): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (!byId.has(id) || inProgress.has(id)) return false;
    inProgress.add(id);
    const visible = decide(optionConds.get(id));
    inProgress.delete(id);
    memo.set(id, visible);
    return visible;
  };

  const answerOf = (id: string): AnswerValue | undefined =>
    byId.has(id) && isVisible(id) ? ownAnswer(answers, id) : undefined;

  const clauseMatches = (c: Clause): boolean => {
    if (c.operator === "variant_is") return c.value !== undefined && c.value === variantGid;
    if (!c.optionId) return false;
    const a = answerOf(c.optionId);
    switch (c.operator) {
      case "is_empty": return isEmptyAnswer(a);
      case "is_not_empty": return !isEmptyAnswer(a);
      case "equals": return c.value !== undefined && answerStrings(a).includes(c.value);
      case "not_equals": return !(c.value !== undefined && answerStrings(a).includes(c.value));
      case "contains": {
        if (c.value === undefined || !a) return false;
        if (a.type === "choice") return a.valueIds.includes(c.value);
        if (a.type === "text") return a.text.toLowerCase().includes(c.value.toLowerCase());
        return false;
      }
    }
  };

  const groupMatches = (g: ConditionGroup): boolean => {
    const all = g.all ?? [];
    const any = g.any ?? [];
    if (all.length + any.length === 0) return false;
    return all.every(clauseMatches) && (any.length === 0 || any.some(clauseMatches));
  };

  const options = new Set<string>();
  const values = new Map<string, Set<string>>();
  for (const o of config.options) {
    if (!isVisible(o.id)) continue;
    options.add(o.id);
    if (isChoiceOption(o)) {
      values.set(
        o.id,
        new Set(o.values.filter((v) => decide(valueConds.get(`${o.id}\u0000${v.id}`))).map((v) => v.id)),
      );
    }
  }
  return { options, values };
}

export function visibleOptions(config: VisibilityConfig, answers: Answers, variantGid: string): Set<string> {
  return evaluateVisibility(config, answers, variantGid).options;
}

const NONE: ReadonlySet<string> = new Set();

/** Selectable value ids of a choice option; empty when the option is hidden or not a choice. */
export function selectableValues(vis: Visibility, optionId: string): ReadonlySet<string> {
  return vis.values.get(optionId) ?? NONE;
}
