import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";

/** Minimal object-store surface the worker needs for T02. Grows in Part 08. */
export interface ObjectStorage {
  /** Deletes objects; missing keys count as success. Returns the keys that could NOT be deleted. */
  deleteObjects(keys: string[]): Promise<{ failed: string[] }>;
}

/** Returns null when S3 env vars are not set (typical in local dev). */
export function createS3StorageFromEnv(env = process.env): ObjectStorage | null {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;

  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: env.S3_REGION || "auto",
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });

  return {
    async deleteObjects(keys) {
      const failed: string[] = [];
      // S3 DeleteObjects accepts at most 1000 keys per request.
      for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        try {
          const res = await client.send(
            new DeleteObjectsCommand({
              Bucket: S3_BUCKET,
              Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
            }),
          );
          for (const e of res.Errors ?? []) if (e.Key) failed.push(e.Key);
        } catch (err) {
          console.error("[storage] DeleteObjects request failed", err);
          failed.push(...chunk);
        }
      }
      return { failed };
    },
  };
}
