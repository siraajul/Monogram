import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl } from "./db-url";

// Creates the test database if needed and applies migrations to it.
export default async function setup() {
  const testUrl = new URL(testDatabaseUrl());
  const dbName = testUrl.pathname.slice(1);
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Unsafe test database name: ${dbName}`);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const rows = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
  });
}
