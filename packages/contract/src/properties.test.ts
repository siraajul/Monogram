import { describe, expect, it } from "vitest";
import type { Answers } from "./answers";
import type { Option } from "./options";
import { toLineProperties, type LinePropertyContext } from "./properties";
import {
  c, cfg, choiceOpt, eq, n, numberOpt, show, si, sl, slots, slotsOpt, st, t, textOpt, up, uploadOpt, V1, val,
} from "./fixtures";

const ctx: LinePropertyContext = { variantGid: V1, designId: "d1", token: "tok", group: "g1" };
const props = (options: Option[], answers: Answers, over: Partial<LinePropertyContext> = {}, conds: Parameters<typeof cfg>[1] = []) =>
  toLineProperties(cfg(options, conds), answers, { ...ctx, ...over });

const SYSTEM = { _design_id: "d1", _design_token: "tok", _set: "set1:v3", _group: "g1" };

describe("toLineProperties", () => {
  it("always writes the system properties; _preview only when there is a preview", () => {
    expect(props([], {})).toEqual(SYSTEM);
    expect(props([], {}, { previewUrl: "https://cdn/p.png" })).toEqual({ ...SYSTEM, _preview: "https://cdn/p.png" });
  });

  it("text uses the option label as the name and the normalized text as the value", () => {
    expect(props([textOpt({ transform: "upper" })], { name: t("  maya ") })).toEqual({ ...SYSTEM, Name: "MAYA" });
  });

  it("omits empty answers, unknown options and wrong-typed answers", () => {
    const options = [textOpt(), choiceOpt(), numberOpt(), uploadOpt(), slotsOpt()];
    const answers = { name: t("  "), pick: c(), qty: t("5"), photo: up(), slots: slots(null, null, null), ghost: t("x") };
    expect(props(options, answers)).toEqual(SYSTEM);
    expect(props([textOpt()], { name: c("a") })).toEqual(SYSTEM);
    expect(props([choiceOpt()], { pick: t("a") })).toEqual(SYSTEM);
    expect(props([uploadOpt()], { photo: t("a") })).toEqual(SYSTEM);
    expect(props([slotsOpt()], { slots: t("a") })).toEqual(SYSTEM);
    expect(props([numberOpt()], { qty: c("a") })).toEqual(SYSTEM);
  });

  it("number is written as a string", () => {
    expect(props([numberOpt()], { qty: n(2.5) })).toEqual({ ...SYSTEM, Qty: "2.5" });
  });

  it("choice writes the selected labels, skipping unknown and hidden values", () => {
    const o = choiceOpt({ type: "checkbox", values: [val("a", { label: "Gold" }), val("b", { label: "Silver" })] });
    expect(props([o], { pick: c("b", "a", "zzz") })).toEqual({ ...SYSTEM, Pick: "Silver, Gold" });
    const conds = [{ id: "h", target: { optionId: "pick", valueId: "a" }, action: "hide" as const, when: { all: [{ operator: "variant_is" as const, value: V1 }] } }];
    expect(props([o], { pick: c("a", "b") }, {}, conds)).toEqual({ ...SYSTEM, Pick: "Silver" });
    expect(props([o], { pick: c("zzz") })).toEqual(SYSTEM);
  });

  it("hiddenFromCart options get a _ prefix", () => {
    expect(props([textOpt({ hiddenFromCart: true })], { name: t("Maya") })).toEqual({ ...SYSTEM, _Name: "Maya" });
  });

  it("hidden options are not sent", () => {
    const options = [choiceOpt({ id: "toggle", label: "Toggle" }), textOpt()];
    const conds = [show("s", "name", { all: [eq("toggle", "a")] })];
    expect(props(options, { name: t("Maya") }, {}, conds)).toEqual(SYSTEM);
    expect(props(options, { name: t("Maya"), toggle: c("a") }, {}, conds)).toEqual({ ...SYSTEM, Toggle: "A", Name: "Maya" });
  });

  it("variant_is conditions use the variant from the context", () => {
    const conds = [show("s", "name", { all: [{ operator: "variant_is", value: "gid://v/9" }] })];
    expect(props([textOpt()], { name: t("Maya") }, {}, conds)).toEqual(SYSTEM);
    expect(props([textOpt()], { name: t("Maya") }, { variantGid: "gid://v/9" }, conds)).toMatchObject({ Name: "Maya" });
  });

  describe("upload", () => {
    const o = uploadOpt();
    it("shows URLs, else names, else a file count", () => {
      const uploads = { a: { url: "https://cdn/a.png", name: "a.png" }, b: { name: "b.png" } };
      expect(props([o], { photo: up("a") }, { uploads })).toEqual({ ...SYSTEM, Photo: "https://cdn/a.png" });
      expect(props([o], { photo: up("a", "b") }, { uploads })).toEqual({ ...SYSTEM, Photo: "https://cdn/a.png, b.png" });
      expect(props([o], { photo: up("a", "zzz") }, { uploads })).toEqual({ ...SYSTEM, Photo: "2 files" });
      expect(props([o], { photo: up("a") })).toEqual({ ...SYSTEM, Photo: "1 file" });
    });
  });

  describe("slots", () => {
    const font = choiceOpt({ id: "font", type: "font", values: [val("script", { label: "Script", fontId: "f1" }), val("block", { label: "Block", fontId: "f2" })] });
    const colour = choiceOpt({ id: "colour", type: "swatch", values: [val("green", { label: "Green" }), val("red", { label: "Red" })] });
    const o = slotsOpt({ slotCount: 4, text: { maxLength: 8, perFontRules: { f2: { transform: "upper" } } }, fontOptionId: "font", colorOptionId: "colour" });

    it("writes Placement N with kind, content, font and colour; skips empty slots but keeps numbering", () => {
      const answers = { slots: slots(st("pickle", { fontId: "f2", colorValueId: "green" }), null, sl("a", { fontId: "f1" }), si("star", "Star")) };
      expect(props([font, colour, o], answers)).toEqual({
        ...SYSTEM,
        "Placement 1": "Text: PICKLE (Block, Green)",
        "Placement 3": "Letter: a (Script)",
        "Placement 4": "Icon: Star",
      });
    });

    it("falls back to the selected font option; omits details it cannot resolve", () => {
      const answers = { font: c("block"), slots: slots(st("ab"), st("cd", { colorValueId: "nope" }), null, null) };
      expect(props([font, colour, o], answers)).toMatchObject({
        "Placement 1": "Text: AB (Block)",
        "Placement 2": "Text: CD (Block)",
      });
    });

    it("works without linked font/colour options", () => {
      expect(props([slotsOpt()], { slots: slots(st("ab", { fontId: "x", colorValueId: "y" }), null, null) })).toMatchObject({ "Placement 1": "Text: ab" });
    });

    it("applies the hiddenFromCart prefix to placements", () => {
      expect(props([slotsOpt({ hiddenFromCart: true })], { slots: slots(st("a"), null, null) })).toMatchObject({ "_Placement 1": "Text: a" });
    });
  });
});
