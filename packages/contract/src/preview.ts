import { z } from "zod";

const fraction = z.number();

export const LayerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["text", "image", "clipart", "slots"]),
  bindOptionId: z.string().optional(),
  x: fraction, y: fraction, w: fraction, h: fraction, rotation: z.number(),
  text: z
    .object({
      fontId: z.string().optional(),
      size: z.number().positive(),
      minSize: z.number().positive(),
      color: z.string(),
      align: z.enum(["left", "center", "right"]),
      fit: z.enum(["shrink", "wrap", "none"]),
      curve: z.number().optional(),
    })
    .optional(),
});
export type Layer = z.infer<typeof LayerSchema>;

export const PrintAreaSchema = z.object({
  id: z.string().min(1),
  x: fraction, y: fraction, w: fraction, h: fraction, rotation: z.number(),
  clip: z.enum(["rect", "ellipse"]).optional(),
  output: z
    .object({ widthPx: z.number().int().positive(), heightPx: z.number().int().positive(), dpi: z.number().positive() })
    .optional(),
  layout: z.enum(["row", "column", "free"]),
  layers: z.array(LayerSchema),
});
export type PrintArea = z.infer<typeof PrintAreaSchema>;

export const PreviewConfigSchema = z.object({
  mode: z.enum(["simple", "template"]),
  views: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      imageByVariant: z.record(z.string(), z.string()).optional(),
      printAreas: z.array(PrintAreaSchema),
    }),
  ),
});
export type PreviewConfig = z.infer<typeof PreviewConfigSchema>;
