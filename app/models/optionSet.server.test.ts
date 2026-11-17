import { beforeEach, describe, expect, it } from "vitest";
import { emptyDraft, type OptionSetDraft } from "@personalizer/contract";
import { prisma, resetDb } from "../../test/db";
import { getOrCreateShop } from "./shop.server";
import {
  createOptionSet,
  getOptionSet,
  listOptionSets,
  publishOptionSet,
  updateOptionSet,
} from "./optionSet.server";
import { NotFoundError, PublishValidationError } from "./errors";

const draftWithName = (): OptionSetDraft => ({
  ...emptyDraft(),
  options: [{ id: "name", type: "text", label: "Name", required: true, maxLength: 10 }],
});

let shopId: string;
beforeEach(async () => {
  await resetDb();
  shopId = (await getOrCreateShop("a.myshopify.com", { currency: "EUR" })).id;
});

describe("optionSet model", () => {
  it("creates with an empty draft by default", async () => {
    const set = await createOptionSet(shopId, { name: "  Mugs  " });
    expect(set).toMatchObject({ name: "Mugs", status: "DRAFT", version: 1 });
    expect(set.draft.options).toEqual([]);
    expect(set.assignment).toEqual({ priority: 0 });
  });

  it("rejects an invalid draft and an empty name", async () => {
    const bad = { ...emptyDraft(), options: [{ id: "x", type: "text", label: "x", required: true }] };
    await expect(createOptionSet(shopId, { name: "A", draft: bad as unknown as OptionSetDraft })).rejects.toThrow();
    await expect(createOptionSet(shopId, { name: "   " })).rejects.toThrow("name is required");
    expect(await prisma.optionSet.count()).toBe(0);
  });

  it("create -> update -> publish: version increments and snapshots are written", async () => {
    const set = await createOptionSet(shopId, { name: "Necklace" });

    const edited = await updateOptionSet(shopId, set.id, {
      name: "Necklace v2",
      draft: draftWithName(),
      assignment: { productGids: ["gid://shopify/Product/1"], priority: 5 },
    });
    expect(edited.name).toBe("Necklace v2");
    expect(edited.draft.options).toHaveLength(1);
    expect(edited.assignment.priority).toBe(5);
    expect(edited.status).toBe("DRAFT");

    const first = await publishOptionSet(shopId, set.id);
    expect(first.optionSet).toMatchObject({ status: "PUBLISHED", version: 1 });
    expect(first.optionSet.publishedAt).toBeInstanceOf(Date);
    expect(first.config).toMatchObject({ optionSetId: set.id, version: 1, currency: "EUR", schema: 1 });

    await updateOptionSet(shopId, set.id, { draft: { ...draftWithName(), options: [] } });
    const second = await publishOptionSet(shopId, set.id);
    expect(second.optionSet.version).toBe(2);

    const versions = await prisma.optionSetVersion.findMany({
      where: { optionSetId: set.id },
      orderBy: { version: "asc" },
    });
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    // Old snapshots are immutable: v1 still has the option that v2 removed.
    expect((versions[0].config as { options: unknown[] }).options).toHaveLength(1);
    expect((versions[1].config as { options: unknown[] }).options).toHaveLength(0);
  });

  it("includes referenced fonts in the published config", async () => {
    const font = await prisma.font.create({
      data: { shopId, family: "Demo", woff2Url: "https://x/f.woff2", sourceUrl: "https://x/f.ttf" },
    });
    const draft: OptionSetDraft = {
      ...emptyDraft(),
      options: [
        {
          id: "font", type: "font", label: "Font", required: true,
          values: [{ id: "v1", label: "Demo", value: "demo", fontId: font.id }],
        },
      ],
    };
    const set = await createOptionSet(shopId, { name: "F", draft });
    const { config } = await publishOptionSet(shopId, set.id);
    expect(config.fonts).toEqual([
      { id: font.id, family: "Demo", woff2Url: "https://x/f.woff2", weight: 400, style: "normal" },
    ]);
  });

  it("refuses to publish an invalid set and writes nothing", async () => {
    const draft: OptionSetDraft = {
      ...emptyDraft(),
      options: [{ id: "a", type: "dropdown", label: "Size", required: true, values: [{ id: "v", label: "", value: "v" }] }],
    };
    const set = await createOptionSet(shopId, { name: "Broken", draft });
    const err = await publishOptionSet(shopId, set.id).catch((e) => e);
    expect(err).toBeInstanceOf(PublishValidationError);
    expect(err.issues.map((i: { code: string }) => i.code)).toEqual(["empty_label"]);
    expect(await prisma.optionSetVersion.count()).toBe(0);
    expect((await getOptionSet(shopId, set.id))?.status).toBe("DRAFT");
  });

  it("refuses fonts the shop does not have", async () => {
    const draft: OptionSetDraft = {
      ...emptyDraft(),
      options: [{ id: "f", type: "font", label: "Font", required: true, values: [{ id: "v", label: "X", value: "x", fontId: "gone" }] }],
    };
    const set = await createOptionSet(shopId, { name: "Fonts", draft });
    await expect(publishOptionSet(shopId, set.id)).rejects.toThrow(/font/i);
  });

  it("sets that charge extra need a fee product on the shop", async () => {
    const draft: OptionSetDraft = {
      ...emptyDraft(),
      options: [{ id: "g", type: "checkbox", label: "Gift", required: false, values: [{ id: "y", label: "Yes", value: "y", priceAdd: 5 }] }],
    };
    const set = await createOptionSet(shopId, { name: "Priced", draft });
    await expect(publishOptionSet(shopId, set.id)).rejects.toBeInstanceOf(PublishValidationError);

    await prisma.shop.update({ where: { id: shopId }, data: { feeProductId: "gid://shopify/Product/999" } });
    await expect(publishOptionSet(shopId, set.id)).resolves.toMatchObject({ optionSet: { status: "PUBLISHED" } });
  });

  it("lists summaries filtered by status", async () => {
    const a = await createOptionSet(shopId, { name: "A" });
    await createOptionSet(shopId, { name: "B" });
    await publishOptionSet(shopId, a.id);

    expect(await listOptionSets(shopId)).toHaveLength(2);
    const published = await listOptionSets(shopId, { status: "PUBLISHED" });
    expect(published.map((s) => s.name)).toEqual(["A"]);
    expect(published[0]).not.toHaveProperty("draft");
  });

  it("is scoped by shop: other shops cannot read, update or publish", async () => {
    const other = (await getOrCreateShop("b.myshopify.com")).id;
    const set = await createOptionSet(shopId, { name: "Mine" });

    expect(await getOptionSet(other, set.id)).toBeNull();
    expect(await listOptionSets(other)).toEqual([]);
    await expect(updateOptionSet(other, set.id, { name: "Hacked" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(publishOptionSet(other, set.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getOptionSet(shopId, set.id))?.name).toBe("Mine");
  });

  it("cascades: deleting a shop removes its sets and versions", async () => {
    const set = await createOptionSet(shopId, { name: "A" });
    await publishOptionSet(shopId, set.id);
    await prisma.shop.delete({ where: { id: shopId } });
    expect(await prisma.optionSet.count()).toBe(0);
    expect(await prisma.optionSetVersion.count()).toBe(0);
  });
});
