import { beforeEach, describe, expect, it } from "vitest";
import { OptionSetDraftSchema } from "@personalizer/contract";
import { prisma, resetDb } from "../../test/db";
import { seedDevData } from "./seed.server";
import { publishOptionSet } from "./optionSet.server";

beforeEach(resetDb);

describe("seedDevData", () => {
  it("creates the shop and 3 valid starter option sets, idempotently", async () => {
    const shop = await seedDevData("seed.myshopify.com");
    await seedDevData("seed.myshopify.com");

    expect(await prisma.shop.count()).toBe(1);
    expect(await prisma.font.count()).toBe(2);
    expect(await prisma.asset.count()).toBe(12);
    const sets = await prisma.optionSet.findMany({ where: { shopId: shop.id }, orderBy: { name: "asc" } });
    expect(sets.map((s) => s.name)).toEqual(["Monogram tote", "Name necklace", "Photo gift"]);
    for (const s of sets) expect(OptionSetDraftSchema.safeParse(s.draft).success).toBe(true);
  });

  it("starter sets publish (once a fee product exists) and include the necklace fonts", async () => {
    const shop = await seedDevData("seed.myshopify.com");
    await prisma.shop.update({ where: { id: shop.id }, data: { feeProductId: "gid://shopify/Product/1" } });
    for (const s of await prisma.optionSet.findMany({ where: { shopId: shop.id } })) {
      await expect(publishOptionSet(shop.id, s.id)).resolves.toBeDefined();
    }
    const necklace = await prisma.optionSet.findFirstOrThrow({ where: { shopId: shop.id, name: "Name necklace" } });
    const { config } = await publishOptionSet(shop.id, necklace.id); // second publish -> v2
    expect(config.version).toBe(2);
    expect(config.fonts.map((f) => f.family).sort()).toEqual(["Demo Block", "Demo Script"]);
  });
});
