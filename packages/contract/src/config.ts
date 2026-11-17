import { z } from "zod";
import { OptionSchema } from "./options";
import { ConditionSchema } from "./conditions";
import { PreviewConfigSchema } from "./preview";

export const PricingSchema = z.object({
  mode: z.enum(["fee_product", "cart_transform"]),
  feeVariantMap: z.record(z.string(), z.string()).optional(),
});

export const UiSchema = z.object({
  accent: z.string().optional(),
  radius: z.number().nonnegative().optional(),
  showPriceLine: z.boolean(),
  addToCartGuardText: z.string(),
});

/**
 * Everything a merchant edits for one option set. Stored in `OptionSet.draft`.
 * Decision (docs/decisions.md): not spelled out in Part 03, so it is ProductConfig
 * minus the fields filled in at publish time (optionSetId, version, currency, fonts).
 */
export const OptionSetDraftSchema = z.object({
  schema: z.literal(1),
  options: z.array(OptionSchema),
  conditions: z.array(ConditionSchema),
  preview: PreviewConfigSchema.optional(),
  pricing: PricingSchema,
  ui: UiSchema,
});
export type OptionSetDraft = z.infer<typeof OptionSetDraftSchema>;

export const FontRefSchema = z.object({
  id: z.string().min(1),
  family: z.string(),
  woff2Url: z.string(),
  weight: z.number().int(),
  style: z.string(),
});

/** Published to the product metafield and snapshotted in OptionSetVersion.config. */
export const ProductConfigSchema = OptionSetDraftSchema.extend({
  optionSetId: z.string().min(1),
  version: z.number().int().positive(),
  currency: z.string().length(3),
  fonts: z.array(FontRefSchema),
});
export type ProductConfig = z.infer<typeof ProductConfigSchema>;

export function emptyDraft(): OptionSetDraft {
  return {
    schema: 1,
    options: [],
    conditions: [],
    pricing: { mode: "fee_product" },
    ui: { showPriceLine: true, addToCartGuardText: "Please complete your personalization." },
  };
}
