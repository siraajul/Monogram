import { z } from "zod";

export const OptionTypeSchema = z.enum([
  "text", "textarea", "number",
  "dropdown", "radio", "checkbox",
  "swatch", "font", "clipart",
  "slots", "upload",
  "date", "hidden", // v2
]);
export type OptionType = z.infer<typeof OptionTypeSchema>;

const id = z.string().min(1);

// Labels may be empty while a merchant is still editing; validateOptionSet rejects them at publish.
export const OptionValueSchema = z.object({
  id,
  label: z.string(),
  value: z.string(),
  hex: z.string().optional(),
  imageUrl: z.string().optional(),
  fontId: z.string().optional(),
  priceAdd: z.number().optional(), // shop currency, major units
});
export type OptionValue = z.infer<typeof OptionValueSchema>;

const baseShape = {
  id,
  label: z.string(),
  helpText: z.string().optional(),
  required: z.boolean(),
  hiddenFromCart: z.boolean().optional(),
  bindTo: z.string().optional(),
};

const TextRuleSchema = z.object({
  maxLength: z.number().int().positive().optional(),
  allowed: z.string().optional(),
  transform: z.enum(["upper", "lower"]).optional(),
});
export const PerFontRulesSchema = z.record(z.string(), TextRuleSchema);

export const TextOptionSchema = z.object({
  ...baseShape,
  type: z.enum(["text", "textarea"]),
  placeholder: z.string().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive(),
  maxLines: z.number().int().positive().optional(),
  allowed: z.string().optional(), // regex source
  transform: z.enum(["none", "upper", "lower"]).optional(),
  perFontRules: PerFontRulesSchema.optional(), // keyed by Font id (OptionValue.fontId)
  /** Font option whose selection picks the per-font rule. Falls back to the first font option. */
  fontOptionId: z.string().optional(),
  pricePerChar: z.number().nonnegative().optional(),
});
export type TextOption = z.infer<typeof TextOptionSchema>;

export const ChoiceOptionSchema = z.object({
  ...baseShape,
  type: z.enum(["dropdown", "radio", "checkbox", "swatch", "font", "clipart"]),
  values: z.array(OptionValueSchema),
  libraryId: z.string().optional(),
  minSelect: z.number().int().nonnegative().optional(),
  maxSelect: z.number().int().positive().optional(),
  display: z.enum(["grid", "list", "pills"]).optional(),
});
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>;

export const SlotsOptionSchema = z.object({
  ...baseShape,
  type: z.literal("slots"),
  slotCount: z.number().int().positive(),
  minFilled: z.number().int().nonnegative(),
  kinds: z.array(z.enum(["text", "letter", "icon"])).min(1),
  text: z.object({
    maxLength: z.number().int().positive(),
    perFontRules: PerFontRulesSchema.optional(),
  }),
  fontOptionId: z.string().optional(),
  colorOptionId: z.string().optional(),
  iconLibraryId: z.string().optional(),
  pricePerSlot: z.number().nonnegative().optional(),
});
export type SlotsOption = z.infer<typeof SlotsOptionSchema>;

export const UploadOptionSchema = z.object({
  ...baseShape,
  type: z.literal("upload"),
  accept: z.array(z.string()).min(1),
  maxBytes: z.number().int().positive(),
  minWidth: z.number().int().positive().optional(),
  minHeight: z.number().int().positive().optional(),
  maxFiles: z.number().int().positive(),
  pricePerFile: z.number().nonnegative().optional(),
  crop: z.object({ aspect: z.number().positive() }).optional(), // v2
});
export type UploadOption = z.infer<typeof UploadOptionSchema>;

export const NumberOptionSchema = z.object({
  ...baseShape,
  type: z.literal("number"),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
});
export type NumberOption = z.infer<typeof NumberOptionSchema>;

export const OptionSchema = z.discriminatedUnion("type", [
  TextOptionSchema,
  ChoiceOptionSchema,
  SlotsOptionSchema,
  UploadOptionSchema,
  NumberOptionSchema,
]);
export type Option = z.infer<typeof OptionSchema>;
