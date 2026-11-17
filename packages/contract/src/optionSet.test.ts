import { describe, expect, it } from "vitest";
import { emptyDraft, type OptionSetDraft } from "./config";
import type { Condition } from "./conditions";
import type { Option } from "./options";
import { validateOptionSet, type OptionSetValidationContext } from "./optionSet";
import { choiceOpt, eq, hide, numberOpt, show, slotsOpt, textOpt, uploadOpt, val } from "./fixtures";

const draft = (options: Option[], conditions: Condition[] = [], pricing: OptionSetDraft["pricing"] = { mode: "fee_product" }): OptionSetDraft => ({
  ...emptyDraft(), options, conditions, pricing,
});
const codes = (d: OptionSetDraft, ctx?: OptionSetValidationContext) => validateOptionSet(d, ctx).map((i) => i.code);

describe("validateOptionSet", () => {
  it("accepts an empty draft and a sensible one", () => {
    expect(codes(draft([]))).toEqual([]);
    const ok = draft(
      [choiceOpt({ id: "toggle" }), textOpt({ id: "second", allowed: "^[a-z]*$", label: "Second" })],
      [show("s", "second", { all: [eq("toggle", "a")] })],
    );
    expect(codes(ok)).toEqual([]);
  });

  describe("ids and labels", () => {
    it("duplicate option ids and value ids", () => {
      expect(codes(draft([textOpt({ label: "A" }), textOpt({ label: "B" })]))).toEqual(["duplicate_option_id"]);
      expect(codes(draft([choiceOpt({ values: [val("a"), val("a")] })]))).toEqual(["duplicate_value_id"]);
    });
    it("values without labels (whitespace counts as empty)", () => {
      const issues = validateOptionSet(draft([choiceOpt({ values: [val("a", { label: "  " })] })]));
      expect(issues).toMatchObject([{ code: "empty_label", optionId: "pick", valueId: "a" }]);
    });
    it("options without labels", () => {
      expect(codes(draft([textOpt({ label: " " })]))).toEqual(["empty_label"]);
    });
    it("duplicate and reserved property names (case-insensitive)", () => {
      expect(codes(draft([textOpt({ id: "a", label: "Name" }), textOpt({ id: "b", label: "name" })]))).toEqual(["duplicate_property_name"]);
      expect(codes(draft([textOpt({ id: "a", label: "Name" }), textOpt({ id: "b", label: "Name", hiddenFromCart: true })]))).toEqual([]);
      expect(codes(draft([textOpt({ label: "_Design_ID" })]))).toEqual(["reserved_property_name"]);
      expect(codes(draft([textOpt({ label: "design_id", hiddenFromCart: true })]))).toEqual(["reserved_property_name"]);
    });
  });

  describe("conditions", () => {
    const options = [choiceOpt({ id: "a", label: "A" }), choiceOpt({ id: "b", label: "B" }), choiceOpt({ id: "c", label: "C" })];

    it("rejects a condition cycle (A needs B, B needs A)", () => {
      const conds = [show("1", "a", { all: [eq("b", "a")] }), show("2", "b", { all: [eq("a", "a")] })];
      const issues = validateOptionSet(draft(options, conds));
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ code: "cycle" });
      expect(issues[0].message).toContain("a → b → a");
    });

    it("rejects a longer cycle and a self reference", () => {
      const conds = [
        show("1", "a", { all: [eq("b", "x")] }), show("2", "b", { all: [eq("c", "x")] }), hide("3", "c", { any: [eq("a", "x")] }),
      ];
      expect(codes(draft(options, conds))).toEqual(["cycle"]);
      expect(codes(draft(options, [show("1", "a", { all: [eq("a", "x")] })]))).toEqual(["cycle"]);
    });

    it("allows chains, forward references and shared dependencies (no false positives)", () => {
      const conds = [
        show("1", "c", { all: [eq("b", "x")] }), show("2", "b", { all: [eq("a", "x")] }), show("3", "c", { all: [eq("a", "y")] }),
      ];
      expect(codes(draft(options, conds))).toEqual([]);
    });

    it("value-level conditions cannot form a cycle, even reading their own option", () => {
      const conds = [
        hide("1", "a", { all: [eq("a", "a")] }, "b"),
        show("2", "b", { all: [eq("a", "a")] }),
        show("3", "a", { all: [eq("c", "a")] }),
      ];
      expect(codes(draft(options, conds))).toEqual([]);
    });

    it("unknown targets, values and clause options", () => {
      expect(codes(draft(options, [show("1", "ghost", { all: [eq("a", "x")] })]))).toEqual(["unknown_option"]);
      expect(codes(draft(options, [show("1", "a", { all: [eq("ghost", "x")] })]))).toEqual(["unknown_option"]);
      expect(codes(draft(options, [show("1", "a", { all: [{ operator: "is_empty" }] })]))).toEqual(["unknown_option"]);
      expect(codes(draft(options, [show("1", "a", { all: [eq("b", "x")] }, "ghost")]))).toEqual(["unknown_value"]);
      expect(codes(draft([textOpt(), ...options], [show("1", "name", { all: [eq("a", "x")] }, "v")]))).toEqual(["unknown_value"]);
      expect(codes(draft(options, [show("1", "ghost", { all: [eq("ghost", "x")] }, "v")]))).toEqual(["unknown_option", "unknown_option"]);
    });

    it("variant_is clauses need no option", () => {
      expect(codes(draft(options, [show("1", "a", { all: [{ operator: "variant_is", value: "v" }] })]))).toEqual([]);
    });
  });

  describe("fonts", () => {
    const fontOpt = (values = [val("s", { fontId: "f1" })]) => choiceOpt({ id: "font", type: "font", label: "Font", values });

    it("font values without a font", () => {
      expect(validateOptionSet(draft([fontOpt([val("s")])]))).toMatchObject([{ code: "missing_font", valueId: "s" }]);
    });
    it("font ids the shop does not have (only when known fonts are given)", () => {
      expect(codes(draft([fontOpt()]))).toEqual([]);
      expect(codes(draft([fontOpt()]), { knownFontIds: new Set(["f1"]) })).toEqual([]);
      expect(codes(draft([fontOpt()]), { knownFontIds: new Set(["other"]) })).toEqual(["missing_font"]);
    });
    it("linked font / colour options must exist and have the right type", () => {
      const swatch = choiceOpt({ id: "colour", type: "swatch", label: "Colour" });
      const ok = textOpt({ fontOptionId: "font" });
      expect(codes(draft([fontOpt(), ok]))).toEqual([]);
      expect(codes(draft([fontOpt(), textOpt({ fontOptionId: "ghost" })]))).toEqual(["unknown_option"]);
      expect(codes(draft([fontOpt(), swatch, slotsOpt({ fontOptionId: "font", colorOptionId: "colour", iconLibraryId: "lib" })]))).toEqual([]);
      expect(codes(draft([fontOpt(), swatch, slotsOpt({ fontOptionId: "colour", colorOptionId: "font", iconLibraryId: "lib" })]))).toEqual(["unknown_option", "unknown_option"]);
    });
  });

  describe("choices and slots", () => {
    it("choice options need values (clipart may use a library)", () => {
      expect(codes(draft([choiceOpt({ values: [] })]))).toEqual(["empty_choices"]);
      expect(codes(draft([choiceOpt({ type: "clipart", values: [], libraryId: "lib" })]))).toEqual([]);
      expect(codes(draft([choiceOpt({ type: "clipart", values: [] })]))).toEqual(["empty_choices"]);
    });
    it("icon slots need a library", () => {
      expect(codes(draft([slotsOpt({ kinds: ["icon"] })]))).toEqual(["missing_library"]);
      expect(codes(draft([slotsOpt({ kinds: ["text"] })]))).toEqual([]);
    });
  });

  describe("patterns and limits", () => {
    it("invalid regex in text options, per-font rules and slot rules", () => {
      expect(codes(draft([textOpt({ allowed: "([" })]))).toEqual(["invalid_regex"]);
      expect(codes(draft([textOpt({ perFontRules: { f: { allowed: "(" } } })]))).toEqual(["invalid_regex"]);
      expect(codes(draft([slotsOpt({ kinds: ["text"], text: { maxLength: 3, perFontRules: { f: { allowed: "(" } } } })]))).toEqual(["invalid_regex"]);
    });
    it("min above max", () => {
      expect(codes(draft([textOpt({ minLength: 5, maxLength: 3 })]))).toEqual(["invalid_limits"]);
      expect(codes(draft([numberOpt({ min: 5, max: 1 })]))).toEqual(["invalid_limits"]);
      expect(codes(draft([slotsOpt({ kinds: ["text"], minFilled: 9 })]))).toEqual(["invalid_limits"]);
      expect(codes(draft([choiceOpt({ type: "checkbox", minSelect: 3, maxSelect: 2 })]))).toEqual(["invalid_limits"]);
      expect(codes(draft([choiceOpt({ type: "checkbox", minSelect: 1 })]))).toEqual([]);
    });
  });

  describe("pricing", () => {
    const priced = [choiceOpt({ values: [val("a", { priceAdd: 10 })] })];

    it("price rules need a fee mapping in fee_product mode", () => {
      expect(codes(draft(priced))).toEqual(["missing_fee_mapping"]);
      expect(codes(draft(priced), { feeMappingAvailable: true })).toEqual([]);
      expect(codes(draft(priced, [], { mode: "fee_product", feeVariantMap: { "100": "gid://v/1" } }))).toEqual([]);
    });
    it("an empty map does not count; cart_transform needs no map", () => {
      expect(codes(draft(priced, [], { mode: "fee_product", feeVariantMap: {} }))).toEqual(["missing_fee_mapping"]);
      expect(codes(draft(priced, [], { mode: "cart_transform" }))).toEqual([]);
    });
    it("every kind of price rule counts", () => {
      for (const o of [textOpt({ pricePerChar: 1 }), slotsOpt({ kinds: ["text"], pricePerSlot: 1 }), uploadOpt({ pricePerFile: 1 })]) {
        expect(codes(draft([o]))).toEqual(["missing_fee_mapping"]);
      }
    });
    it("zero prices need no mapping; negative prices are rejected", () => {
      expect(codes(draft([choiceOpt({ values: [val("a", { priceAdd: 0 })] })]))).toEqual([]);
      expect(codes(draft([choiceOpt({ values: [val("a", { priceAdd: -1 })] })]), { feeMappingAvailable: true })).toEqual(["negative_price"]);
      expect(codes(draft([uploadOpt({ pricePerFile: -1 })]), { feeMappingAvailable: true })).toEqual(["negative_price"]);
    });
  });

  it("reports every problem, not just the first", () => {
    const d = draft(
      [choiceOpt({ values: [val("a", { label: "" })] }), textOpt({ allowed: "(" })],
      [show("1", "ghost", { all: [eq("pick", "a")] })],
    );
    expect(codes(d).sort()).toEqual(["empty_label", "invalid_regex", "unknown_option"]);
  });
});
