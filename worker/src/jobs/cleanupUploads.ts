import type { PrismaClient } from "@prisma/client";
import type { ObjectStorage } from "../storage.ts";

export interface CleanupResult {
  deletedRows: number;
  failedObjects: number;
}

/**
 * Deletes Upload rows (and their stored objects) where expiresAt < now and no design uses them.
 * Objects go first: if the process dies in between, rows remain and the next run retries,
 * so nothing is orphaned. Rows whose object could not be deleted are kept for the next run.
 * Expired uploads can't legitimately become "used" (design creation rejects expired uploads, T14),
 * and the final delete re-checks `usedByDesignId` anyway.
 */
export async function cleanupExpiredUploads(opts: {
  prisma: PrismaClient;
  storage: ObjectStorage;
  now?: Date;
  batchSize?: number;
}): Promise<CleanupResult> {
  const { prisma, storage } = opts;
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? 500;
  const result: CleanupResult = { deletedRows: 0, failedObjects: 0 };
  const skipIds = new Set<string>(); // rows that failed this run; don't loop on them

  for (;;) {
    const batch = await prisma.upload.findMany({
      where: { expiresAt: { lt: now }, usedByDesignId: null, id: { notIn: [...skipIds] } },
      orderBy: { expiresAt: "asc" },
      take: batchSize,
      select: { id: true, key: true },
    });
    if (batch.length === 0) break;

    const { failed } = await storage.deleteObjects(batch.map((u) => u.key));
    const failedKeys = new Set(failed);
    const ok = batch.filter((u) => !failedKeys.has(u.key));
    for (const u of batch) if (failedKeys.has(u.key)) skipIds.add(u.id);
    result.failedObjects += failedKeys.size;

    if (ok.length > 0) {
      const { count } = await prisma.upload.deleteMany({
        where: { id: { in: ok.map((u) => u.id) }, usedByDesignId: null, expiresAt: { lt: now } },
      });
      result.deletedRows += count;
    }
  }
  return result;
}
