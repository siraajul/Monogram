import { PrismaClient } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { cleanupExpiredUploads } from "./jobs/cleanupUploads.ts";
import { createS3StorageFromEnv } from "./storage.ts";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

// BullMQ workers require maxRetriesPerRequest: null on their connection.
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();
const storage = createS3StorageFromEnv();

// `ping` lives on the render queue for now; real jobs arrive in Part 08.
const renderWorker = new Worker(
  "render",
  async (job) => {
    if (job.name === "ping") {
      console.log(`[worker] ping job ${job.id} received`, job.data);
      return { pong: true };
    }
    throw new Error(`Unknown job: ${job.name}`);
  },
  { connection, concurrency: Number(process.env.RENDER_CONCURRENCY ?? 4) },
);

// Housekeeping queue (not in Part 01's list; added in T02, see docs/decisions.md).
const maintenanceWorker = new Worker(
  "maintenance",
  async (job) => {
    if (job.name === "cleanup-uploads") {
      if (!storage) {
        console.warn("[worker] cleanup-uploads skipped: S3_* env vars are not set");
        return { skipped: true };
      }
      const result = await cleanupExpiredUploads({ prisma, storage });
      console.log("[worker] cleanup-uploads done", result);
      return result;
    }
    throw new Error(`Unknown job: ${job.name}`);
  },
  { connection, concurrency: 1 },
);

for (const w of [renderWorker, maintenanceWorker]) {
  w.on("failed", (job, err) => console.error(`[worker] job ${job?.id} (${job?.name}) failed`, err));
}

const queueConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// Nightly at 03:00 server time. upsertJobScheduler is idempotent across restarts.
const maintenanceQueue = new Queue("maintenance", { connection: queueConnection });
await maintenanceQueue.upsertJobScheduler(
  "cleanup-uploads-nightly",
  { pattern: "0 3 * * *" },
  { name: "cleanup-uploads" },
);

// Enqueue a ping on boot when asked: `PING_ON_START=1 npm run dev:worker`
if (process.env.PING_ON_START === "1") {
  const renderQueue = new Queue("render", { connection: queueConnection });
  await renderQueue.add("ping", { at: new Date().toISOString() });
  await renderQueue.close();
}

console.log("[worker] started, waiting for jobs");

const shutdown = async () => {
  await Promise.all([renderWorker.close(), maintenanceWorker.close(), maintenanceQueue.close()]);
  await prisma.$disconnect();
  connection.disconnect();
  queueConnection.disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
