import prisma from "../app/db.server";

/** Wipes all app tables (not Session) between tests. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "Shop","OptionSet","OptionSetVersion","ProductAssignment","Font","AssetLibrary","Asset","Template","Upload","Design","OrderLine","UsageRecord" RESTART IDENTITY CASCADE`,
  );
}

export { prisma };
