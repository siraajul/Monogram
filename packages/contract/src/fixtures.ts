// Test helpers shared by the contract tests (not exported from the package).
import type { Answers, AnswerValue, SlotItem } from "./answers";
import type { Condition } from "./conditions";
import type { ProductConfig } from "./config";
import type { ChoiceOption, NumberOption, Option, OptionValue, SlotsOption, TextOption, UploadOption } from "./options";

export const V1 = "gid://shopify/ProductVariant/1";
export const V2 = "gid://shopify/ProductVariant/2";

export const cfg = (options: Option[], conditions: Condition[] = []): ProductConfig => ({
  schema: 1,
  optionSetId: "set1",
  version: 3,
  currency: "USD",
  options,
  conditions,
  fonts: [],
  pricing: { mode: "fee_product" },
  ui: { showPriceLine: true, addToCartGuardText: "" },
});

export const textOpt = (o: Partial<TextOption> = {}): TextOption => ({
  id: "name", type: "text", label: "Name", required: false, maxLength: 10, ...o,
});
export const numberOpt = (o: Partial<NumberOption> = {}): NumberOption => ({
  id: "qty", type: "number", label: "Qty", required: false, min: 0, max: 10, step: 1, ...o,
});
export const val = (id: string, o: Partial<OptionValue> = {}): OptionValue => ({
  id, label: id.toUpperCase(), value: id, ...o,
});
export const choiceOpt = (o: Partial<ChoiceOption> = {}): ChoiceOption => ({
  id: "pick", type: "dropdown", label: "Pick", required: false,
  values: [val("a"), val("b"), val("c")], ...o,
});
export const slotsOpt = (o: Partial<SlotsOption> = {}): SlotsOption => ({
  id: "slots", type: "slots", label: "Slots", required: false,
  slotCount: 3, minFilled: 0, kinds: ["text", "letter", "icon"], text: { maxLength: 6 }, ...o,
});
export const uploadOpt = (o: Partial<UploadOption> = {}): UploadOption => ({
  id: "photo", type: "upload", label: "Photo", required: false,
  accept: ["image/jpeg", "image/png"], maxBytes: 1024 * 1024, maxFiles: 2, ...o,
});

export const t = (text: string): AnswerValue => ({ type: "text", text });
export const c = (...valueIds: string[]): AnswerValue => ({ type: "choice", valueIds });
export const n = (value: number): AnswerValue => ({ type: "number", value });
export const up = (...uploadIds: string[]): AnswerValue => ({ type: "upload", uploadIds });
export const slots = (...items: Array<SlotItem | null>): AnswerValue => ({ type: "slots", items });
export const st = (text: string, rest: Partial<Extract<SlotItem, { kind: "text" }>> = {}): SlotItem => ({ kind: "text", text, ...rest });
export const sl = (text: string, rest: Partial<Extract<SlotItem, { kind: "letter" }>> = {}): SlotItem => ({ kind: "letter", text, ...rest });
export const si = (assetId: string, name = assetId): SlotItem => ({ kind: "icon", assetId, name });

export const show = (id: string, optionId: string, when: Condition["when"], valueId?: string): Condition => ({
  id, target: { optionId, ...(valueId ? { valueId } : {}) }, action: "show", when,
});
export const hide = (id: string, optionId: string, when: Condition["when"], valueId?: string): Condition => ({
  id, target: { optionId, ...(valueId ? { valueId } : {}) }, action: "hide", when,
});
export const eq = (optionId: string, value: string) => ({ optionId, operator: "equals" as const, value });

export const A = (a: Answers): Answers => a;
