import { describe, expect, it } from "vitest";
import type { Answers } from "./answers";
import type { Option } from "./options";
import { priceFor } from "./price";
import {
  c, cfg, choiceOpt, eq, hide, n, numberOpt, show, si, slots, slotsOpt, st, t, textOpt, up, uploadOpt, V1, val,
} from "./fixtures";

const price = (options: Option[], answers: Answers, conds: Parameters<typeof cfg>[1] = []) =>
  priceFor(cfg(options, conds), answers, V1);

describe("priceFor", () => {
  it("is 0 for an empty form and for options without prices", () => {
    expect(price([textOpt(), choiceOpt(), numberOpt()], {})).toBe(0);
    expect(price([textOpt(), choiceOpt(), numberOpt()], { name: t("Maya"), pick: c("a"), qty: n(3) })).toBe(0);
  });

  it("choice: sums priceAdd of the selected values", () => {
    const o = choiceOpt({ type: "checkbox", values: [val("a", { priceAdd: 10 }), val("b", { priceAdd: 2.5 }), val("c")] });
    expect(price([o], { pick: c("a") })).toBe(10);
    expect(price([o], { pick: c("a", "b", "c") })).toBe(12.5);
  });

  it("ignores unknown ids, duplicate ids and values hidden by a condition", () => {
    const o = choiceOpt({ type: "checkbox", values: [val("a", { priceAdd: 10 }), val("b", { priceAdd: 5 })] });
    const conds = [hide("h", "pick", { all: [{ operator: "variant_is", value: V1 }] }, "b")];
    expect(price([o], { pick: c("a", "a", "zzz", "b") }, conds)).toBe(10);
  });

  it("text: pricePerChar x non-whitespace characters of the final text", () => {
    const o = textOpt({ pricePerChar: 0.5 });
    expect(price([o], { name: t("Ma ya") })).toBe(2); // 4 chars
    expect(price([o], { name: t("  😀😀  ") })).toBe(1); // trimmed, emoji count once each
    expect(price([o], { name: t("") })).toBe(0);
  });

  it("text pricing follows per-font transform rules", () => {
    const font = choiceOpt({ id: "font", type: "font", values: [val("s", { fontId: "f1" })] });
    const o = textOpt({ pricePerChar: 1, perFontRules: { f1: { transform: "upper" } } });
    expect(price([font, o], { font: c("s"), name: t("ab") })).toBe(2);
  });

  it("slots: pricePerSlot x filled slots", () => {
    const o = slotsOpt({ pricePerSlot: 1.25 });
    expect(price([o], { slots: slots(st("a"), null, si("star")) })).toBe(2.5);
    expect(price([o], { slots: slots(st(" "), null, null) })).toBe(0);
    expect(price([slotsOpt()], { slots: slots(st("a"), null, null) })).toBe(0);
  });

  it("upload: pricePerFile x distinct files", () => {
    const o = uploadOpt({ pricePerFile: 5 });
    expect(price([o], { photo: up("a", "b") })).toBe(10);
    expect(price([o], { photo: up("a", "a") })).toBe(5);
  });

  it("hidden options are not priced", () => {
    const options = [choiceOpt({ id: "toggle" }), uploadOpt({ pricePerFile: 5 })];
    const conds = [show("s", "photo", { all: [eq("toggle", "a")] })];
    expect(price(options, { photo: up("a") }, conds)).toBe(0);
    expect(price(options, { toggle: c("a"), photo: up("a") }, conds)).toBe(5);
  });

  it("answers of the wrong type price as 0", () => {
    expect(price([uploadOpt({ pricePerFile: 5 })], { photo: t("x") })).toBe(0);
    expect(price([choiceOpt({ values: [val("a", { priceAdd: 5 })] })], { pick: t("a") })).toBe(0);
    expect(price([textOpt({ pricePerChar: 1 })], { name: c("a") })).toBe(0);
    expect(price([numberOpt()], { qty: n(2) })).toBe(0);
  });

  it("rounds to cents without float drift and never goes negative", () => {
    const o = choiceOpt({ type: "checkbox", values: [val("a", { priceAdd: 0.1 }), val("b", { priceAdd: 0.2 })] });
    expect(price([o], { pick: c("a", "b") })).toBe(0.3);
    const neg = choiceOpt({ values: [val("a", { priceAdd: -5 })] });
    expect(price([neg], { pick: c("a") })).toBe(0);
  });

  it("adds up across options", () => {
    const options = [
      choiceOpt({ values: [val("a", { priceAdd: 10 })] }),
      textOpt({ pricePerChar: 0.1 }),
      uploadOpt({ pricePerFile: 5 }),
    ];
    expect(price(options, { pick: c("a"), name: t("abc"), photo: up("u") })).toBe(15.3);
  });
});
