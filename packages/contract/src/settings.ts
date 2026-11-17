import { z } from "zod";

/** Public + private shop settings stored in Shop.settings. Grows with Parts 04/10. */
export const ShopSettingsSchema = z.object({
  accent: z.string().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  notifyEmail: z.string().optional(),
});
export type ShopSettings = z.infer<typeof ShopSettingsSchema>;

/** Designer edition (v2): detailed shape arrives with T24. */
export const TemplateDataSchema = z.object({
  views: z.array(z.unknown()).default([]),
});
export type TemplateData = z.infer<typeof TemplateDataSchema>;
