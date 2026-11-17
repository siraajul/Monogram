import { testDatabaseUrl } from "./db-url";

// Must run before app/db.server.ts is imported so the singleton client uses the test DB.
process.env.DATABASE_URL = testDatabaseUrl();
