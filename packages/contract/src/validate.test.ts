import { describe, expect, it } from "vitest";
import type { Answers } from "./answers";
import type { Option } from "./options";
import { validate, type ValidateContext } from "./validate";
import {
  c, cfg, choiceOpt, eq, hide, n, numberOpt, show, si, sl, slots, slotsOpt, st, t, textOpt, up, uploadOpt, V1, val,
} from "./fixtures";

const run = (options: Option[], answers: Answers, conds: Parameters<typeof cfg>[1] = [], ctx?: ValidateContext) =>
  validate(cfg(options, conds), answers, V1, ctx);
const codes = (...args: Parameters<typeof run>) => run(...args).map((i) => `${i.optionId}:${i.code}`);

describe("validate: visibility", () => {
  it("returns nothing for an empty, optional form", () => {
    expect(run([textOpt()], {})).toEqual([]);
  });

  it("does not validate hidden options, but does once they are shown", () => {
    const options = [choiceOpt({ id: "toggle" }), textOpt({ id: "second", required: true })];
    const conds = [show("s", "second", { all: [eq("toggle", "a")] })];
    expect(run(options, {}, conds)).toEqual([]);
    expect(codes(options, { toggle: c("a") }, conds)).toEqual(["second:required"]);
  });

  it("ignores answers for unknown options", () => {
    expect(run([textOpt()], { ghost: t("x") })).toEqual([]);
  });

  it("returns at most one issue per option, in option order", () => {
    const options = [textOpt({ id: "b", required: true }), textOpt({ id: "a", required: true })];
    expect(run(options, {}).map((i) => i.optionId)).toEqual(["b", "a"]);
  });

  it("includes a readable message", () => {
    expect(run([textOpt({ required: true })], {})[0].message).toBe("Name is required.");
  });
});

describe("validate: text", () => {
  it("required: blank counts as missing", () => {
    expect(codes([textOpt({ required: true })], { name: t("   ") })).toEqual(["name:required"]);
    expect(codes([textOpt({ required: true })], {})).toEqual(["name:required"]);
  });

  it("optional and empty is fine", () => {
    expect(run([textOpt({ minLength: 3 })], { name: t("") })).toEqual([]);
  });

  it("wrong answer type", () => {
    expect(codes([textOpt()], { name: c("a") })).toEqual(["name:invalid_answer"]);
  });

  it("min and max length count characters, not UTF-16 units", () => {
    const o = textOpt({ minLength: 2, maxLength: 3 });
    expect(codes([o], { name: t("a") })).toEqual(["name:too_short"]);
    expect(codes([o], { name: t("abc") })).toEqual([]);
    expect(codes([o], { name: t("abcd") })).toEqual(["name:too_long"]);
    expect(codes([o], { name: t("😀😀😀") })).toEqual([]); // 3 emoji = 3 chars
  });

  it("trims before measuring", () => {
    expect(codes([textOpt({ maxLength: 3 })], { name: t("  abc  ") })).toEqual([]);
  });

  it("allowed pattern", () => {
    const o = textOpt({ allowed: "^[A-Za-z]*$" });
    expect(codes([o], { name: t("Maya") })).toEqual([]);
    expect(codes([o], { name: t("M4ya") })).toEqual(["name:invalid_chars"]);
  });

  it("a broken pattern is ignored at runtime (validateOptionSet reports it)", () => {
    expect(codes([textOpt({ allowed: "([" })], { name: t("x") })).toEqual([]);
  });

  it("checks the allowed pattern against the transformed text", () => {
    const o = textOpt({ allowed: "^[A-Z]*$", transform: "upper" });
    expect(codes([o], { name: t("maya") })).toEqual([]);
    expect(codes([textOpt({ allowed: "^[a-z]*$", transform: "lower" })], { name: t("MAYA") })).toEqual([]);
  });

  it("text must be single-line; textarea may have lines up to maxLines", () => {
    expect(codes([textOpt()], { name: t("a\nb") })).toEqual(["name:invalid_chars"]);
    const area = textOpt({ type: "textarea", maxLength: 50, maxLines: 2 });
    expect(codes([area], { name: t("a\nb") })).toEqual([]);
    expect(codes([area], { name: t("a\r\nb\nc") })).toEqual(["name:too_many_lines"]);
    expect(codes([textOpt({ type: "textarea", maxLength: 50 })], { name: t("a\nb\nc\nd") })).toEqual([]);
  });

  describe("per-font rules", () => {
    const font = choiceOpt({
      id: "font", type: "font", required: true,
      values: [val("script", { fontId: "f-script" }), val("block", { fontId: "f-block" }), val("plain")],
    });
    const name = textOpt({
      maxLength: 10,
      perFontRules: {
        "f-script": { maxLength: 4 },
        "f-block": { allowed: "^[A-Z]*$", transform: "upper" },
      },
    });

    it("applies the rule of the selected font", () => {
      expect(codes([font, name], { font: c("script"), name: t("Maya1") })).toEqual(["name:too_long"]);
      expect(codes([font, name], { font: c("script"), name: t("Maya") })).toEqual([]);
      expect(codes([font, name], { font: c("block"), name: t("a1") })).toEqual(["name:invalid_chars"]);
      expect(codes([font, name], { font: c("block"), name: t("maya") })).toEqual([]);
    });

    it("falls back to the base rule when the font has no rule, none is selected, or it has no fontId", () => {
      expect(codes([font, name], { name: t("Maya Longer") })).toEqual(["font:required", "name:too_long"]);
      expect(codes([font, name], { font: c("plain"), name: t("MayaMaya") })).toEqual([]);
    });

    it("uses fontOptionId when set, and ignores a hidden font option", () => {
      const other = { ...font, id: "font2" };
      const o = { ...name, fontOptionId: "font2" };
      expect(codes([font, other, o], { font: c("block"), font2: c("script"), name: t("Mayaa") })).toEqual(["name:too_long"]);
      const conds = [show("s", "font", { all: [{ operator: "variant_is", value: "nope" }] })];
      expect(codes([font, name], { font: c("script"), name: t("Mayaaaa") }, conds)).toEqual([]);
    });

    it("an explicit fontOptionId that is not a font option falls back to the base rule", () => {
      const o = { ...name, fontOptionId: "name" };
      expect(codes([font, o], { font: c("script"), name: t("Mayaaaa") })).toEqual([]);
    });

    it("ignores a font answer of the wrong type", () => {
      expect(codes([font, name], { font: t("script"), name: t("Mayaaaa") })).toEqual(["font:invalid_answer"]);
    });

    it("prototype-named font ids do not leak into rules", () => {
      const f = choiceOpt({ id: "font", type: "font", values: [val("x", { fontId: "constructor" })] });
      expect(codes([f, name], { font: c("x"), name: t("Mayaa") })).toEqual([]);
    });
  });
});

describe("validate: number", () => {
  const o = numberOpt({ min: 1, max: 10, step: 0.5, required: true });
  it("required / optional", () => {
    expect(codes([o], {})).toEqual(["qty:required"]);
    expect(codes([numberOpt()], {})).toEqual([]);
  });
  it("type, finite, range and step", () => {
    expect(codes([o], { qty: t("5") })).toEqual(["qty:invalid_answer"]);
    expect(codes([o], { qty: n(NaN) })).toEqual(["qty:invalid_answer"]);
    expect(codes([o], { qty: n(0.5) })).toEqual(["qty:out_of_range"]);
    expect(codes([o], { qty: n(11) })).toEqual(["qty:out_of_range"]);
    expect(codes([o], { qty: n(2.25) })).toEqual(["qty:bad_step"]);
    expect(codes([o], { qty: n(2.5) })).toEqual([]);
    expect(codes([numberOpt({ min: 0, max: 1, step: 0.1 })], { qty: n(0.3) })).toEqual([]); // float noise
  });
});

describe("validate: choice", () => {
  it("required", () => {
    expect(codes([choiceOpt({ required: true })], {})).toEqual(["pick:required"]);
    expect(codes([choiceOpt({ required: true })], { pick: c() })).toEqual(["pick:required"]);
    expect(codes([choiceOpt()], { pick: c() })).toEqual([]);
  });

  it("wrong answer type, unknown value, duplicates", () => {
    expect(codes([choiceOpt()], { pick: t("a") })).toEqual(["pick:invalid_answer"]);
    expect(codes([choiceOpt()], { pick: c("zzz") })).toEqual(["pick:invalid_choice"]);
    expect(codes([choiceOpt({ type: "checkbox" })], { pick: c("a", "a") })).toEqual(["pick:invalid_choice"]);
  });

  it("single-select types accept exactly one value", () => {
    for (const type of ["dropdown", "radio", "swatch", "font", "clipart"] as const) {
      expect(codes([choiceOpt({ type })], { pick: c("a") })).toEqual([]);
      expect(run([choiceOpt({ type })], { pick: c("a", "b") })[0].message).toBe("Pick: choose only one.");
    }
  });

  it("a selected value hidden by a value-level condition is rejected", () => {
    const conds = [hide("h", "pick", { all: [{ operator: "variant_is", value: V1 }] }, "b")];
    expect(codes([choiceOpt()], { pick: c("b") }, conds)).toEqual(["pick:invalid_choice"]);
    expect(codes([choiceOpt()], { pick: c("a") }, conds)).toEqual([]);
  });

  describe("checkbox min/max", () => {
    const box = (o = {}) => choiceOpt({ type: "checkbox", ...o });
    it("minSelect / maxSelect", () => {
      const o = box({ minSelect: 2, maxSelect: 2 });
      expect(codes([o], { pick: c("a") })).toEqual(["pick:too_few"]);
      expect(codes([o], { pick: c("a", "b") })).toEqual([]);
      expect(run([o], { pick: c("a", "b", "c") })[0]).toMatchObject({ code: "too_many", message: "Pick: choose at most 2." });
    });
    it("optional may be left empty even with a minimum; required means at least one", () => {
      expect(codes([box({ minSelect: 2 })], {})).toEqual([]);
      expect(codes([box({ required: true })], { pick: c("a") })).toEqual([]);
      expect(codes([box({ required: true, minSelect: 2 })], { pick: c("a") })).toEqual(["pick:too_few"]);
    });
    it("maxSelect defaults to the number of values", () => {
      expect(codes([box()], { pick: c("a", "b", "c") })).toEqual([]);
    });
  });
});

describe("validate: slots", () => {
  const font = choiceOpt({ id: "font", type: "font", values: [val("script", { fontId: "f1" }), val("block", { fontId: "f2" })] });
  const colour = choiceOpt({ id: "colour", type: "swatch", values: [val("red"), val("blue")] });
  const o = slotsOpt({
    minFilled: 2, kinds: ["text", "letter", "icon"], text: { maxLength: 5, perFontRules: { f1: { maxLength: 2 } } },
    fontOptionId: "font", colorOptionId: "colour",
  });
  const opts = [font, colour, o];

  it("required / optional / min filled", () => {
    expect(codes([slotsOpt({ required: true })], {})).toEqual(["slots:required"]);
    expect(codes([slotsOpt({ required: true })], { slots: slots(null, null, null) })).toEqual(["slots:required"]);
    expect(codes([slotsOpt({ minFilled: 2 })], { slots: slots(null, null, null) })).toEqual([]);
    expect(codes([slotsOpt({ minFilled: 2 })], { slots: slots(st("a"), null, null) })).toEqual(["slots:too_few"]);
    expect(run([slotsOpt({ minFilled: 1, required: true })], { slots: slots(null, null, st("a")) })).toEqual([]);
    expect(run([slotsOpt({ minFilled: 1 })], { slots: slots(st("a"), null, null) })).toEqual([]);
    expect(run([slotsOpt({ minFilled: 2 })], { slots: slots(st("a"), null, null) })[0].message).toBe("Slots: fill at least 2 placements.");
    expect(run([slotsOpt({ required: true, minFilled: 0 })], { slots: slots(st("a"), null, null) })).toEqual([]);
    expect(run([slotsOpt({ minFilled: 1, kinds: ["text"] })], { slots: slots(st("a")) })).toEqual([{ optionId: "slots", code: "invalid_answer", message: "Slots has an invalid answer." }]);
  });

  it("answer shape: type and length must match slotCount", () => {
    expect(codes([o], { slots: t("x") })).toEqual(["slots:invalid_answer"]);
    expect(codes(opts, { slots: slots(st("a"), st("b")) })).toEqual(["slots:invalid_answer"]);
  });

  it("item kinds", () => {
    const textOnly = slotsOpt({ kinds: ["text"] });
    expect(run([textOnly], { slots: slots(sl("a"), null, null) })[0].message).toContain("placement 1: letter is not allowed");
  });

  it("letters are exactly one character; text respects maxLength", () => {
    expect(codes(opts, { slots: slots(sl("AB"), st("x"), null) })).toEqual(["slots:slot_invalid"]);
    expect(codes(opts, { slots: slots(sl("A"), sl("😀"), null) })).toEqual([]);
    expect(run(opts, { slots: slots(st("toolong"), st("ok"), null) })[0].message).toContain("placement 1: at most 5");
  });

  it("per-font rules: slot font, else the selected font option", () => {
    expect(codes(opts, { slots: slots(st("abc", { fontId: "f1" }), st("x"), null) })).toEqual(["slots:slot_invalid"]);
    expect(codes(opts, { slots: slots(st("abc", { fontId: "f2" }), st("x"), null) })).toEqual([]);
    expect(codes(opts, { font: c("script"), slots: slots(st("abc"), st("x"), null) })).toEqual(["slots:slot_invalid"]);
  });

  it("slot fonts and colours must come from the linked options", () => {
    expect(run(opts, { slots: slots(st("a", { fontId: "nope" }), st("b"), null) })[0].message).toContain("unknown font");
    expect(run(opts, { slots: slots(st("a", { colorValueId: "nope" }), st("b"), null) })[0].message).toContain("unknown colour");
    expect(codes(opts, { slots: slots(st("a", { fontId: "f2", colorValueId: "red" }), st("b"), null) })).toEqual([]);
  });

  it("without linked options, slot fonts/colours are not checked", () => {
    const plain = slotsOpt({ minFilled: 1 });
    expect(codes([plain], { slots: slots(st("a", { fontId: "any", colorValueId: "any" }), null, null) })).toEqual([]);
  });

  it("slot colour of a linked option that is not a choice option is rejected", () => {
    const broken = slotsOpt({ colorOptionId: "name" });
    expect(codes([textOpt(), broken], { slots: slots(st("a", { colorValueId: "x" }), null, null) })).toEqual(["slots:slot_invalid"]);
  });

  it("slot allowed pattern and transform", () => {
    const pat = slotsOpt({ text: { maxLength: 5, perFontRules: { f1: { allowed: "^[A-Z]*$", transform: "upper" } } }, fontOptionId: "font" });
    expect(codes([font, pat], { slots: slots(st("ab", { fontId: "f1" }), null, null) })).toEqual([]);
    expect(codes([font, pat], { slots: slots(st("a1", { fontId: "f1" }), null, null) })).toEqual(["slots:slot_invalid"]);
    expect(run([font, pat], { slots: slots(st("a1", { fontId: "f1" }), null, null) })[0].message).toContain("not allowed");
  });

  it("font option values without a font id are not selectable for slots", () => {
    const f = choiceOpt({ id: "font", type: "font", values: [val("plain"), val("script", { fontId: "f1" })] });
    const s = slotsOpt({ fontOptionId: "font" });
    expect(codes([f, s], { slots: slots(st("a", { fontId: "f1" }), null, null) })).toEqual([]);
    expect(codes([f, s], { slots: slots(st("a", { fontId: "zzz" }), null, null) })).toEqual(["slots:slot_invalid"]);
  });

  it("icons need only an asset id", () => {
    expect(codes(opts, { slots: slots(si("star"), si("heart"), null) })).toEqual([]);
  });
});

describe("validate: upload", () => {
  const o = uploadOpt({ required: true, minWidth: 100, minHeight: 100 });
  const good = { mime: "image/png", bytes: 1000, width: 200, height: 200 };

  it("required / optional / type / duplicates / count", () => {
    expect(codes([o], {})).toEqual(["photo:required"]);
    expect(codes([uploadOpt()], { photo: up() })).toEqual([]);
    expect(codes([o], { photo: t("x") })).toEqual(["photo:invalid_answer"]);
    expect(codes([o], { photo: up("a", "a") })).toEqual(["photo:invalid_answer"]);
    expect(codes([o], { photo: up("") })).toEqual(["photo:invalid_answer"]);
    expect(codes([o], { photo: up("a", "b", "c") })).toEqual(["photo:upload_count"]);
    expect(run([uploadOpt({ maxFiles: 1 })], { photo: up("a", "b") })[0].message).toBe("Photo: upload at most 1 file.");
  });

  it("only counts files when no metadata is supplied", () => {
    expect(codes([o], { photo: up("a") })).toEqual([]);
  });

  it("checks type, size and dimensions against the metadata", () => {
    const ctx = (m: object): ValidateContext => ({ uploads: { a: { ...good, ...m } } });
    expect(codes([o], { photo: up("a") }, [], ctx({}))).toEqual([]);
    expect(codes([o], { photo: up("a") }, [], { uploads: {} })).toEqual(["photo:upload_unknown"]);
    expect(codes([o], { photo: up("constructor") }, [], { uploads: {} })).toEqual(["photo:upload_unknown"]);
    expect(codes([o], { photo: up("a") }, [], ctx({ mime: "image/gif" }))).toEqual(["photo:upload_type"]);
    expect(codes([o], { photo: up("a") }, [], ctx({ bytes: 5 * 1024 * 1024 }))).toEqual(["photo:upload_size"]);
    expect(run([o], { photo: up("a") }, [], ctx({ bytes: 5 * 1024 * 1024 }))[0].message).toContain("1 MB");
    expect(codes([o], { photo: up("a") }, [], ctx({ width: 50 }))).toEqual(["photo:upload_dimensions"]);
    expect(codes([o], { photo: up("a") }, [], ctx({ height: 50 }))).toEqual(["photo:upload_dimensions"]);
    expect(codes([o], { photo: up("a") }, [], ctx({ width: undefined }))).toEqual(["photo:upload_dimensions"]);
    expect(codes([o], { photo: up("a") }, [], ctx({ height: undefined }))).toEqual(["photo:upload_dimensions"]);
  });

  it("supports wildcard mime rules and no dimension limits", () => {
    const wild = uploadOpt({ accept: ["image/*"] });
    const meta = { uploads: { a: { mime: "image/webp", bytes: 1 } } };
    expect(codes([wild], { photo: up("a") }, [], meta)).toEqual([]);
    expect(codes([uploadOpt({ accept: ["image/*"] })], { photo: up("a") }, [], { uploads: { a: { mime: "text/plain", bytes: 1 } } })).toEqual(["photo:upload_type"]);
  });
});
