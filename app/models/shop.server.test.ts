import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb } from "../../test/db";
import { getOrCreateShop, getShopByDomain } from "./shop.server";

beforeEach(resetDb);

describe("shop model", () => {
  it("creates once and is idempotent", async () => {
    const a = await getOrCreateShop("s.myshopify.com", { currency: "GBP" });
    const b = await getOrCreateShop("s.myshopify.com");
    expect(b.id).toBe(a.id);
    expect(b.currency).toBe("GBP");
    expect(await prisma.shop.count()).toBe(1);
  });

  it("reinstall clears uninstalledAt", async () => {
    const shop = await getOrCreateShop("s.myshopify.com");
    await prisma.shop.update({ where: { id: shop.id }, data: { uninstalledAt: new Date() } });
    expect((await getOrCreateShop("s.myshopify.com")).uninstalledAt).toBeNull();
    expect(await getShopByDomain("nope.myshopify.com")).toBeNull();
  });
});
