import { z } from "zod";

export const SlotItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string(), fontId: z.string().optional(), colorValueId: z.string().optional() }),
  z.object({ kind: z.literal("letter"), text: z.string(), fontId: z.string().optional(), colorValueId: z.string().optional() }),
  z.object({ kind: z.literal("icon"), assetId: z.string(), name: z.string() }),
]);
export type SlotItem = z.infer<typeof SlotItemSchema>;

export const AnswerValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("choice"), valueIds: z.array(z.string()) }),
  z.object({ type: z.literal("slots"), items: z.array(SlotItemSchema.nullable()) }), // length = slotCount, null = empty
  z.object({ type: z.literal("upload"), uploadIds: z.array(z.string()) }),
  z.object({ type: z.literal("number"), value: z.number() }),
]);
export type AnswerValue = z.infer<typeof AnswerValueSchema>;

/** optionId -> what the shopper chose. */
export const AnswersSchema = z.record(z.string(), AnswerValueSchema);
export type Answers = z.infer<typeof AnswersSchema>;
