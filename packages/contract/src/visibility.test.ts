import { describe, expect, it } from "vitest";
import type { Option } from "./options";
import { evaluateVisibility, selectableValues, visibleOptions } from "./visibility";
import {
  c, cfg, choiceOpt, eq, hide, n, show, si, slots, st, t, textOpt, up, V1, V2, val, numberOpt, uploadOpt, slotsOpt,
} from "./fixtures";

const vis = (options: Parameters<typeof cfg>[0], conds: Parameters<typeof cfg>[1], answers = {}, variant = V1) =>
  visibleOptions(cfg(options, conds), answers, variant);

describe("visibleOptions", () => {
  it("shows everything when there are no conditions", () => {
    expect([...vis([textOpt({ id: "a" }), textOpt({ id: "b" })], [])]).toEqual(["a", "b"]);
  });

  it("hides an option with a show condition until it matches", () => {
    const options = [choiceOpt({ id: "toggle" }), textOpt({ id: "second" })];
    const conds = [show("s", "second", { all: [eq("toggle", "a")] })];
    expect(vis(options, conds, {}).has("second")).toBe(false);
    expect(vis(options, conds, { toggle: c("b") }).has("second")).toBe(false);
    expect(vis(options, conds, { toggle: c("a") }).has("second")).toBe(true);
  });

  it("a matching hide condition wins over a matching show condition", () => {
    const options = [choiceOpt({ id: "x" }), textOpt({ id: "y" })];
    const conds = [show("s", "y", { all: [eq("x", "a")] }), hide("h", "y", { all: [eq("x", "a")] })];
    expect(vis(options, conds, { x: c("a") }).has("y")).toBe(false);
  });

  it("hide alone: visible until it matches", () => {
    const options = [choiceOpt({ id: "x" }), textOpt({ id: "y" })];
    const conds = [hide("h", "y", { all: [eq("x", "a")] })];
    expect(vis(options, conds, {}).has("y")).toBe(true);
    expect(vis(options, conds, { x: c("a") }).has("y")).toBe(false);
  });

  it("any = OR, all = AND, both = AND of the two", () => {
    const options = [choiceOpt({ id: "p" }), choiceOpt({ id: "q" }), textOpt({ id: "t" })];
    const any = [show("s", "t", { any: [eq("p", "a"), eq("q", "a")] })];
    expect(vis(options, any, { q: c("a") }).has("t")).toBe(true);
    expect(vis(options, any, { p: c("b") }).has("t")).toBe(false);

    const all = [show("s", "t", { all: [eq("p", "a"), eq("q", "a")] })];
    expect(vis(options, all, { p: c("a") }).has("t")).toBe(false);
    expect(vis(options, all, { p: c("a"), q: c("a") }).has("t")).toBe(true);

    const both = [show("s", "t", { all: [eq("p", "a")], any: [eq("q", "a"), eq("q", "b")] })];
    expect(vis(options, both, { p: c("a"), q: c("b") }).has("t")).toBe(true);
    expect(vis(options, both, { p: c("a"), q: c("c") }).has("t")).toBe(false);
    expect(vis(options, both, { p: c("b"), q: c("a") }).has("t")).toBe(false);
  });

  it("an empty group never matches (show stays hidden, hide stays visible)", () => {
    const options = [textOpt({ id: "t" })];
    expect(vis(options, [show("s", "t", {})]).has("t")).toBe(false);
    expect(vis(options, [show("s", "t", { all: [], any: [] })]).has("t")).toBe(false);
    expect(vis(options, [hide("h", "t", {})]).has("t")).toBe(true);
  });

  describe("operators", () => {
    const check = (clause: object, answer: unknown, matches: boolean, option: Option = textOpt({ id: "src" })) => {
      const options = [option, textOpt({ id: "t" })];
      const conds = [show("s", "t", { all: [{ optionId: "src", ...clause } as never] })];
      const answers = answer === undefined ? {} : { src: answer as never };
      expect(vis(options, conds, answers).has("t")).toBe(matches);
    };

    it("equals compares text literally and choice by value id", () => {
      check({ operator: "equals", value: "Maya" }, t("Maya"), true);
      check({ operator: "equals", value: "Maya" }, t("maya"), false);
      check({ operator: "equals", value: "b" }, c("a", "b"), true, choiceOpt({ id: "src", type: "checkbox" }));
      check({ operator: "equals" }, t("x"), false); // no value to compare with
      check({ operator: "equals", value: "5" }, n(5), true, numberOpt({ id: "src" }));
      check({ operator: "equals", value: "u1" }, up("u1"), true, uploadOpt({ id: "src" }));
      check({ operator: "equals", value: "x" }, slots(st("x"), null), true, slotsOpt({ id: "src" }));
      check({ operator: "equals", value: "i1" }, slots(si("i1")), true, slotsOpt({ id: "src" }));
      check({ operator: "equals", value: "" }, t(""), false); // empty text has no strings
    });

    it("not_equals is the opposite of equals", () => {
      check({ operator: "not_equals", value: "a" }, c("b"), true, choiceOpt({ id: "src" }));
      check({ operator: "not_equals", value: "a" }, c("a"), false, choiceOpt({ id: "src" }));
      check({ operator: "not_equals", value: "a" }, undefined, true, choiceOpt({ id: "src" }));
      check({ operator: "not_equals" }, t("x"), true);
    });

    it("contains: choice id membership, case-insensitive text substring, false otherwise", () => {
      check({ operator: "contains", value: "b" }, c("a", "b"), true, choiceOpt({ id: "src", type: "checkbox" }));
      check({ operator: "contains", value: "z" }, c("a"), false, choiceOpt({ id: "src", type: "checkbox" }));
      check({ operator: "contains", value: "AYA" }, t("Maya"), true);
      check({ operator: "contains", value: "zzz" }, t("Maya"), false);
      check({ operator: "contains", value: "5" }, n(5), false, numberOpt({ id: "src" }));
      check({ operator: "contains", value: "x" }, undefined, false);
      check({ operator: "contains" }, t("x"), false);
    });

    it("is_empty / is_not_empty for every answer type", () => {
      check({ operator: "is_empty" }, undefined, true);
      check({ operator: "is_empty" }, t("   "), true);
      check({ operator: "is_empty" }, t("x"), false);
      check({ operator: "is_empty" }, c(), true, choiceOpt({ id: "src" }));
      check({ operator: "is_empty" }, up(), true, uploadOpt({ id: "src" }));
      check({ operator: "is_empty" }, slots(null, st(" "), si("")), true, slotsOpt({ id: "src" }));
      check({ operator: "is_empty" }, n(0), false, numberOpt({ id: "src" }));
      check({ operator: "is_not_empty" }, slots(null, st("a")), true, slotsOpt({ id: "src" }));
      check({ operator: "is_not_empty" }, up("u"), true, uploadOpt({ id: "src" }));
    });

    it("a clause without an option id (and not variant_is) is false", () => {
      const options = [textOpt({ id: "t" })];
      expect(vis(options, [show("s", "t", { all: [{ operator: "is_empty" }] })]).has("t")).toBe(false);
    });

    it("variant_is compares the current variant", () => {
      const options = [textOpt({ id: "t" })];
      const conds = [show("s", "t", { all: [{ operator: "variant_is", value: V2 }] })];
      expect(vis(options, conds, {}, V1).has("t")).toBe(false);
      expect(vis(options, conds, {}, V2).has("t")).toBe(true);
      expect(vis(options, [show("s", "t", { all: [{ operator: "variant_is" }] })], {}, V1).has("t")).toBe(false);
    });
  });

  it("a hidden option's answer counts as empty (chains resolve)", () => {
    // c shows only if b equals "x"; b shows only if a equals "go". a is not "go", so b is hidden, so c is hidden.
    const options = [textOpt({ id: "a" }), textOpt({ id: "b" }), textOpt({ id: "c" })];
    const conds = [show("s1", "b", { all: [eq("a", "go")] }), show("s2", "c", { all: [eq("b", "x")] })];
    const answers = { a: t("stop"), b: t("x") };
    expect([...vis(options, conds, answers)]).toEqual(["a"]);
    expect([...vis(options, conds, { ...answers, a: t("go") })]).toEqual(["a", "b", "c"]);
  });

  it("conditions may refer to an option that comes later in the list", () => {
    const options = [textOpt({ id: "first" }), choiceOpt({ id: "later" })];
    const conds = [show("s", "first", { all: [eq("later", "a")] })];
    expect(vis(options, conds, { later: c("a") }).has("first")).toBe(true);
    expect(vis(options, conds, {}).has("first")).toBe(false);
  });

  it("a circular config terminates and hides the options on the cycle", () => {
    const options = [textOpt({ id: "a" }), textOpt({ id: "b" })];
    const conds = [show("s1", "a", { all: [eq("b", "x")] }), show("s2", "b", { all: [eq("a", "x")] })];
    expect([...vis(options, conds, { a: t("x"), b: t("x") })]).toEqual([]);
  });

  it("ignores conditions that target or read unknown options", () => {
    const options = [textOpt({ id: "t" })];
    const conds = [show("s", "ghost", { all: [eq("t", "x")] }), show("s2", "t", { all: [eq("ghost", "x")] })];
    expect([...vis(options, conds, { t: t("x") })]).toEqual([]);
  });

  it("reads answers by own property only", () => {
    const options = [textOpt({ id: "src" }), textOpt({ id: "t" })];
    const conds = [show("s", "t", { all: [{ optionId: "src", operator: "is_not_empty" }] })];
    const answers = JSON.parse('{"__proto__": {"type":"text","text":"x"}}');
    expect(vis(options, conds, answers).has("t")).toBe(false);
  });
});

describe("evaluateVisibility values", () => {
  const options = [choiceOpt({ id: "size", values: [val("s"), val("m"), val("l")] }), choiceOpt({ id: "other" })];

  it("lists selectable values for each visible choice option", () => {
    const v = evaluateVisibility(cfg(options, []), {}, V1);
    expect([...(v.values.get("size") ?? [])]).toEqual(["s", "m", "l"]);
    expect(v.values.has("ghost")).toBe(false);
  });

  it("value-level show/hide conditions", () => {
    const conds = [
      show("show-l", "size", { all: [eq("other", "a")] }, "l"),
      hide("hide-m", "size", { all: [{ operator: "variant_is", value: V2 }] }, "m"),
    ];
    const v1 = evaluateVisibility(cfg(options, conds), {}, V1);
    expect([...(v1.values.get("size") ?? [])]).toEqual(["s", "m"]);
    const v2 = evaluateVisibility(cfg(options, conds), { other: c("a") }, V2);
    expect([...(v2.values.get("size") ?? [])]).toEqual(["s", "l"]);
  });

  it("does not list values of hidden options", () => {
    const conds = [show("s", "size", { all: [eq("other", "a")] })];
    expect(evaluateVisibility(cfg(options, conds), {}, V1).values.has("size")).toBe(false);
  });
});

describe("selectableValues", () => {
  it("is empty for hidden, unknown and non-choice options", () => {
    const options = [choiceOpt({ id: "pick" }), choiceOpt({ id: "hidden" }), textOpt({ id: "t" })];
    const v = evaluateVisibility(cfg(options, [show("s", "hidden", { all: [eq("pick", "zzz")] })]), {}, V1);
    expect([...selectableValues(v, "pick")]).toEqual(["a", "b", "c"]);
    for (const id of ["hidden", "t", "ghost"]) expect(selectableValues(v, id).size).toBe(0);
  });
});
