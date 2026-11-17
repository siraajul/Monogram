import type { Shop } from "@prisma/client";
import prisma from "../db.server";

export function getShopByDomain(domain: string): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { domain } });
}

/** Called on install/auth. Re-installs clear `uninstalledAt`. */
export function getOrCreateShop(domain: string, init: { currency?: string } = {}): Promise<Shop> {
  return prisma.shop.upsert({
    where: { domain },
    create: { domain, ...(init.currency ? { currency: init.currency } : {}) },
    update: { uninstalledAt: null },
  });
}
