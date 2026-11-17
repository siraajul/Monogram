import { describe, expect, it } from "vitest";
import { priceFor, toLineProperties, validate, validateOptionSet, type ProductConfig } from "@personalizer/contract";
import { monogramTote, nameNecklace, photoGift, type StarterContext } from "./starterSets";

const ctx: StarterContext = { fontIds: { script: "f-script", block: "f-block" }, iconLibraryId: "lib" };
const V = "gid://shopify/ProductVariant/1";
const asConfig = (draft: ReturnType<typeof photoGift>["draft"]): ProductConfig => ({
  ...draft, optionSetId: "set", version: 1, currency: "USD", fonts: [],
});
const props = { variantGid: V, designId: "d", token: "t", group: "g" };

describe("starter sets through the contract", () => {
  it("all pass publish validation once a fee product exists", () => {
    for (const s of [nameNecklace(ctx), monogramTote(ctx), photoGift()]) {
      expect(validateOptionSet(s.draft, { feeMappingAvailable: true, knownFontIds: new Set(["f-script", "f-block"]) })).toEqual([]);
    }
  });

  it("name necklace: second name is hidden until asked for, and costs $10", () => {
    const config = asConfig(nameNecklace(ctx).draft);
    const base = {
      name: { type: "text" as const, text: "Maya" },
      font: { type: "choice" as const, valueIds: ["font-script"] },
      metal: { type: "choice" as const, valueIds: ["metal-gold"] },
    };
    expect(validate(config, base, V)).toEqual([]);
    expect(priceFor(config, base, V)).toBe(0);

    const withSecond = {
      ...base,
      "second-name-toggle": { type: "choice" as const, valueIds: ["second-yes"] },
    };
    expect(validate(config, withSecond, V).map((i) => i.optionId)).toEqual(["second-name"]);

    const complete = { ...withSecond, "second-name": { type: "text" as const, text: "Ana" } };
    expect(validate(config, complete, V)).toEqual([]);
    expect(priceFor(config, complete, V)).toBe(10);
    expect(toLineProperties(config, complete, props)).toMatchObject({
      Name: "Maya", Font: "Script", Metal: "Gold", "Add a second name": "Yes, add a second name", "Second name": "Ana",
    });
    expect(validate(config, { ...base, name: { type: "text", text: "M4ya" } }, V)[0]).toMatchObject({ optionId: "name", code: "invalid_chars" });
  });

  it("monogram tote: six slots, one filled is enough", () => {
    const config = asConfig(monogramTote(ctx).draft);
    const answers = {
      font: { type: "choice" as const, valueIds: ["font-block"] },
      thread: { type: "choice" as const, valueIds: ["thread-green"] },
      placements: {
        type: "slots" as const,
        items: [{ kind: "text" as const, text: "PICKLE" }, null, { kind: "icon" as const, assetId: "a1", name: "Star" }, null, null, null],
      },
    };
    expect(validate(config, answers, V)).toEqual([]);
    expect(toLineProperties(config, answers, props)).toMatchObject({
      "Placement 1": "Text: PICKLE (Block)", "Placement 3": "Icon: Star",
    });
  });

  it("photo gift: upload limits come from the Upload row", () => {
    const config = asConfig(photoGift().draft);
    const answers = { photo: { type: "upload" as const, uploadIds: ["u1"] } };
    expect(validate(config, answers, V, { uploads: { u1: { mime: "image/png", bytes: 1000 } } })).toEqual([]);
    expect(validate(config, answers, V, { uploads: { u1: { mime: "image/png", bytes: 16 * 1024 * 1024 } } })[0].code).toBe("upload_size");
    expect(priceFor(config, answers, V)).toBe(5);
  });
});
