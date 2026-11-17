import type { Answers, AnswerValue, SlotItem } from "./answers";
import type { ProductConfig } from "./config";
import type { ChoiceOption, NumberOption, SlotsOption, TextOption, UploadOption } from "./options";
import { evaluateVisibility, selectableValues, type Visibility } from "./visibility";
import {
  charCount, fontOptionFor, isChoiceOption, isFilledSlot, normalizeText, ownAnswer, resolveTextRule,
  safeRegex, valueById, type OptionsConfig,
} from "./util";

export type ValidationCode =
  | "required" | "invalid_answer" | "too_short" | "too_long" | "too_many_lines" | "invalid_chars"
  | "invalid_choice" | "too_few" | "too_many" | "out_of_range" | "bad_step"
  | "slot_invalid" | "upload_count" | "upload_unknown" | "upload_type" | "upload_size" | "upload_dimensions";

export interface ValidationIssue {
  optionId: string;
  /** English message; widgets can translate by `code`. */
  message: string;
  code: ValidationCode;
}

export interface UploadMeta { mime: string; bytes: number; width?: number; height?: number }

export interface ValidateContext {
  /**
   * Metadata of uploaded files (server: from the Upload table). When given, files are checked against
   * accept / maxBytes / minWidth / minHeight; when omitted only the file count is checked.
   */
  uploads?: Record<string, UploadMeta>;
}

type Found = { code: ValidationCode; message: string } | null;

/**
 * Validates the answers of every VISIBLE option, in option order, and returns at most one issue per option
 * (the first rule that fails). Hidden options are skipped; answers for unknown options are ignored.
 * Optional options may be left empty; once filled, or when required, every rule applies.
 */
export function validate(
  config: ProductConfig,
  answers: Answers,
  variantGid: string,
  ctx: ValidateContext = {},
): ValidationIssue[] {
  const vis = evaluateVisibility(config, answers, variantGid);
  const issues: ValidationIssue[] = [];

  for (const option of config.options) {
    if (!vis.options.has(option.id)) continue;
    const answer = ownAnswer(answers, option.id);
    let found: Found;
    switch (option.type) {
      case "text":
      case "textarea":
        found = checkText(config, vis, answers, option, answer);
        break;
      case "number":
        found = checkNumber(option, answer);
        break;
      case "slots":
        found = checkSlots(config, vis, answers, option, answer);
        break;
      case "upload":
        found = checkUpload(option, answer, ctx);
        break;
      default:
        found = checkChoice(option, selectableValues(vis, option.id), answer);
    }
    if (found) issues.push({ optionId: option.id, ...found });
  }
  return issues;
}

const requiredIssue = (label: string): Found => ({ code: "required", message: `${label} is required.` });
const invalidAnswer = (label: string): Found => ({ code: "invalid_answer", message: `${label} has an invalid answer.` });

/** Font id picked in a font option, used to choose per-font text rules. */
export function selectedFontId(
  config: OptionsConfig,
  vis: Visibility,
  answers: Answers,
  fontOptionId: string | undefined,
): string | undefined {
  const fontOption = fontOptionFor(config, fontOptionId);
  if (!fontOption || !vis.options.has(fontOption.id)) return undefined;
  const a = ownAnswer(answers, fontOption.id);
  if (a?.type !== "choice") return undefined;
  return valueById(fontOption, a.valueIds[0])?.fontId;
}

function checkText(
  config: ProductConfig, vis: Visibility, answers: Answers, o: TextOption, a: AnswerValue | undefined,
): Found {
  if (a !== undefined && a.type !== "text") return invalidAnswer(o.label);
  const rule = resolveTextRule(o, o.perFontRules, selectedFontId(config, vis, answers, o.fontOptionId));
  const text = normalizeText(a?.text ?? "", rule.transform);
  if (text === "") return o.required ? requiredIssue(o.label) : null;

  const length = charCount(text);
  if (o.minLength !== undefined && length < o.minLength)
    return { code: "too_short", message: `${o.label} must be at least ${o.minLength} characters.` };
  if (length > rule.maxLength)
    return { code: "too_long", message: `${o.label} must be at most ${rule.maxLength} characters.` };
  // Length is bounded above before any merchant-supplied regex runs on the shopper's text.
  if (o.type === "textarea") {
    const lines = text.split(/\r\n|\r|\n/).length;
    if (o.maxLines !== undefined && lines > o.maxLines)
      return { code: "too_many_lines", message: `${o.label} can have at most ${o.maxLines} lines.` };
  } else if (/[\r\n]/.test(text)) {
    return { code: "invalid_chars", message: `${o.label} must be on a single line.` };
  }
  const re = rule.allowed !== undefined ? safeRegex(rule.allowed) : null;
  if (re && !re.test(text)) return { code: "invalid_chars", message: `${o.label} contains characters that are not allowed.` };
  return null;
}

function checkNumber(o: NumberOption, a: AnswerValue | undefined): Found {
  if (a === undefined) return o.required ? requiredIssue(o.label) : null;
  if (a.type !== "number" || !Number.isFinite(a.value)) return invalidAnswer(o.label);
  if (a.value < o.min || a.value > o.max)
    return { code: "out_of_range", message: `${o.label} must be between ${o.min} and ${o.max}.` };
  const steps = (a.value - o.min) / o.step;
  if (Math.abs(steps - Math.round(steps)) > 1e-9)
    return { code: "bad_step", message: `${o.label} must be a multiple of ${o.step}.` };
  return null;
}

function checkChoice(o: ChoiceOption, selectable: ReadonlySet<string>, a: AnswerValue | undefined): Found {
  if (a !== undefined && a.type !== "choice") return invalidAnswer(o.label);
  const ids = a?.valueIds ?? [];
  if (ids.length === 0) return o.required ? requiredIssue(o.label) : null;

  const known = new Set(o.values.map((v) => v.id));
  if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id) || !selectable.has(id)))
    return { code: "invalid_choice", message: `${o.label}: choose from the available options.` };

  const multi = o.type === "checkbox";
  const min = multi ? (o.required ? Math.max(1, o.minSelect ?? 0) : (o.minSelect ?? 0)) : 1;
  const max = multi ? (o.maxSelect ?? o.values.length) : 1;
  if (ids.length < min) return { code: "too_few", message: `${o.label}: choose at least ${min}.` };
  if (ids.length > max)
    return { code: "too_many", message: max === 1 ? `${o.label}: choose only one.` : `${o.label}: choose at most ${max}.` };
  return null;
}

function checkSlots(
  config: ProductConfig, vis: Visibility, answers: Answers, o: SlotsOption, a: AnswerValue | undefined,
): Found {
  if (a !== undefined && a.type !== "slots") return invalidAnswer(o.label);
  const items = a?.items ?? [];
  if (a !== undefined && items.length !== o.slotCount) return invalidAnswer(o.label);

  const filled = items.filter(isFilledSlot).length;
  if (filled === 0) return o.required ? requiredIssue(o.label) : null;

  const fontOption = fontOptionFor(config, o.fontOptionId);
  const colorOption = o.colorOptionId ? config.options.find((x) => x.id === o.colorOptionId) : undefined;
  const allowedFonts = new Set(fontOption?.values.flatMap((v) => (v.fontId ? [v.fontId] : [])));
  const allowedColors = isChoiceOption(colorOption) ? selectableValues(vis, colorOption.id) : new Set<string>();
  const defaultFont = selectedFontId(config, vis, answers, o.fontOptionId);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isFilledSlot(item)) continue;
    const problem = checkSlotItem(o, item, { allowedFonts, allowedColors, defaultFont, hasFont: !!fontOption, hasColor: !!colorOption });
    if (problem) return { code: "slot_invalid", message: `${o.label}, placement ${i + 1}: ${problem}` };
  }

  const min = o.required ? Math.max(1, o.minFilled) : o.minFilled;
  // `filled` is at least 1 here, so a shortfall only happens when min >= 2.
  if (filled < min) return { code: "too_few", message: `${o.label}: fill at least ${min} placements.` };
  return null;
}

function checkSlotItem(
  o: SlotsOption,
  item: SlotItem,
  ctx: { allowedFonts: ReadonlySet<string>; allowedColors: ReadonlySet<string>; defaultFont: string | undefined; hasFont: boolean; hasColor: boolean },
): string | null {
  if (!o.kinds.includes(item.kind)) return `${item.kind} is not allowed here.`;
  if (item.kind === "icon") return null;

  if (item.fontId !== undefined && ctx.hasFont && !ctx.allowedFonts.has(item.fontId)) return "unknown font.";
  if (item.colorValueId !== undefined && ctx.hasColor && !ctx.allowedColors.has(item.colorValueId)) return "unknown colour.";

  const rule = resolveTextRule({ maxLength: o.text.maxLength }, o.text.perFontRules, item.fontId ?? ctx.defaultFont);
  const text = normalizeText(item.text, rule.transform);
  const length = charCount(text);
  if (item.kind === "letter" && length !== 1) return "enter a single letter.";
  if (length > rule.maxLength) return `at most ${rule.maxLength} characters.`;
  const re = rule.allowed !== undefined ? safeRegex(rule.allowed) : null;
  if (re && !re.test(text)) return "contains characters that are not allowed.";
  return null;
}

function checkUpload(o: UploadOption, a: AnswerValue | undefined, ctx: ValidateContext): Found {
  if (a !== undefined && a.type !== "upload") return invalidAnswer(o.label);
  const ids = a?.uploadIds ?? [];
  if (ids.length === 0) return o.required ? requiredIssue(o.label) : null;
  if (ids.length > o.maxFiles)
    return { code: "upload_count", message: `${o.label}: upload at most ${o.maxFiles} file${o.maxFiles === 1 ? "" : "s"}.` };
  if (new Set(ids).size !== ids.length || ids.some((id) => id === ""))
    return invalidAnswer(o.label);

  if (!ctx.uploads) return null;
  for (const id of ids) {
    const meta = Object.prototype.hasOwnProperty.call(ctx.uploads, id) ? ctx.uploads[id] : undefined;
    if (!meta) return { code: "upload_unknown", message: `${o.label}: file not found, please upload it again.` };
    if (!o.accept.some((rule) => mimeMatches(rule, meta.mime)))
      return { code: "upload_type", message: `${o.label}: file type not allowed.` };
    if (meta.bytes > o.maxBytes)
      return { code: "upload_size", message: `${o.label}: file is larger than ${formatMb(o.maxBytes)}.` };
    if (
      (o.minWidth !== undefined && (meta.width ?? 0) < o.minWidth) ||
      (o.minHeight !== undefined && (meta.height ?? 0) < o.minHeight)
    )
      return { code: "upload_dimensions", message: `${o.label}: image is too small.` };
  }
  return null;
}

const mimeMatches = (rule: string, mime: string): boolean =>
  rule.endsWith("/*") ? mime.startsWith(rule.slice(0, -1)) : rule === mime;

const formatMb = (bytes: number): string => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
