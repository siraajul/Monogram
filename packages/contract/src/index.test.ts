import { describe, expect, it } from "vitest";
import { emptyDraft, OptionSchema, OptionSetDraftSchema, AssignmentSchema } from "./index";

describe("contract schemas", () => {
  it("accepts an empty draft", () => {
    expect(OptionSetDraftSchema.safeParse(emptyDraft()).success).toBe(true);
  });

  it("discriminates option types", () => {
    const text = { id: "a", type: "text", label: "Name", required: true, maxLength: 10 };
    expect(OptionSchema.safeParse(text).success).toBe(true);
    expect(OptionSchema.safeParse({ ...text, type: "textarea" }).success).toBe(true);
    expect(OptionSchema.safeParse({ ...text, maxLength: undefined }).success).toBe(false);
    expect(OptionSchema.safeParse({ ...text, type: "bogus" }).success).toBe(false);
  });

  it("allows empty labels in drafts (validateOptionSet rejects them at publish)", () => {
    const o = { id: "a", type: "dropdown", label: "", required: false, values: [{ id: "v", label: "", value: "v" }] };
    expect(OptionSchema.safeParse(o).success).toBe(true);
  });

  it("defaults assignment priority", () => {
    expect(AssignmentSchema.parse({})).toEqual({ priority: 0 });
  });
});
