import { z } from "zod";

export const OperatorSchema = z.enum([
  "equals", "not_equals", "contains", "is_empty", "is_not_empty", "variant_is",
]);
export type Operator = z.infer<typeof OperatorSchema>;

export const ClauseSchema = z.object({
  optionId: z.string().optional(), // omitted when operator = variant_is
  operator: OperatorSchema,
  value: z.string().optional(),
});
export type Clause = z.infer<typeof ClauseSchema>;

export const ConditionGroupSchema = z.object({
  all: z.array(ClauseSchema).optional(),
  any: z.array(ClauseSchema).optional(),
});
export type ConditionGroup = z.infer<typeof ConditionGroupSchema>;

export const ConditionSchema = z.object({
  id: z.string().min(1),
  target: z.object({ optionId: z.string().min(1), valueId: z.string().optional() }),
  action: z.enum(["show", "hide"]),
  when: ConditionGroupSchema,
});
export type Condition = z.infer<typeof ConditionSchema>;
