import { z } from "zod";

export const AssignmentSchema = z.object({
  productGids: z.array(z.string()).optional(),
  collectionGids: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  vendors: z.array(z.string()).optional(),
  excludeProductGids: z.array(z.string()).optional(),
  priority: z.number().int().default(0), // higher wins when two sets match one product
});
export type Assignment = z.infer<typeof AssignmentSchema>;
