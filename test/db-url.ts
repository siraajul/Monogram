/** Test database URL: TEST_DATABASE_URL, else DATABASE_URL with `_test` appended to the db name. */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? "postgres://personalizer:personalizer@localhost:5433/personalizer";
  const url = new URL(base);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}
