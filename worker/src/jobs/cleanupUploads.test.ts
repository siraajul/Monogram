import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb } from "../../../test/db";
import { cleanupExpiredUploads } from "./cleanupUploads.ts";
import type { ObjectStorage } from "../storage.ts";

const DAY = 86_400_000;
const now = new Date("2026-06-01T03:00:00Z");

function fakeStorage(failKeys: string[] = []) {
  const deleted: string[] = [];
  const storage: ObjectStorage = {
    async deleteObjects(keys) {
      const failed = keys.filter((k) => failKeys.includes(k));
      deleted.push(...keys.filter((k) => !failKeys.includes(k)));
      return { failed };
    },
  };
  return { storage, deleted };
}

const upload = (key: string, over: { expiresAt: Date; usedByDesignId?: string }) =>
  prisma.upload.create({
    data: { shopId: "shop_1", key, mime: "image/png", bytes: 10, ...over },
  });

beforeEach(resetDb);

describe("cleanupExpiredUploads", () => {
  it("deletes expired unused uploads and their objects only", async () => {
    await upload("expired-unused", { expiresAt: new Date(now.getTime() - DAY) });
    await upload("expired-used", { expiresAt: new Date(now.getTime() - DAY), usedByDesignId: "d1" });
    await upload("not-expired", { expiresAt: new Date(now.getTime() + DAY) });
    const { storage, deleted } = fakeStorage();

    const res = await cleanupExpiredUploads({ prisma, storage, now });

    expect(res).toEqual({ deletedRows: 1, failedObjects: 0 });
    expect(deleted).toEqual(["expired-unused"]);
    const left = (await prisma.upload.findMany()).map((u) => u.key).sort();
    expect(left).toEqual(["expired-used", "not-expired"]);
  });

  it("keeps rows whose object could not be deleted so the next run retries", async () => {
    await upload("ok", { expiresAt: new Date(now.getTime() - DAY) });
    await upload("stuck", { expiresAt: new Date(now.getTime() - DAY) });
    const { storage } = fakeStorage(["stuck"]);

    const res = await cleanupExpiredUploads({ prisma, storage, now });

    expect(res).toEqual({ deletedRows: 1, failedObjects: 1 });
    expect((await prisma.upload.findMany()).map((u) => u.key)).toEqual(["stuck"]);

    const retry = await cleanupExpiredUploads({ prisma, storage: fakeStorage().storage, now });
    expect(retry.deletedRows).toBe(1);
    expect(await prisma.upload.count()).toBe(0);
  });

  it("processes more rows than one batch", async () => {
    for (let i = 0; i < 7; i++) await upload(`k${i}`, { expiresAt: new Date(now.getTime() - DAY) });
    const { storage, deleted } = fakeStorage();
    const res = await cleanupExpiredUploads({ prisma, storage, now, batchSize: 3 });
    expect(res.deletedRows).toBe(7);
    expect(deleted).toHaveLength(7);
  });
});
