import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // DB tests share one database and TRUNCATE between tests, so files must not run in parallel.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      // Part 03 acceptance: the four public functions and everything they use are fully covered.
      include: ["packages/contract/src/{visibility,validate,price,properties,optionSet,util}.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      reporter: ["text"],
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/**/*.test.ts"],
        },
      },
      {
        // Needs Postgres (docker compose up -d). Test DB is created automatically.
        test: {
          name: "db",
          include: ["app/**/*.test.ts", "worker/**/*.test.ts", "prisma/**/*.test.ts"],
          globalSetup: ["test/global-setup.ts"],
          setupFiles: ["test/setup.ts"],
        },
      },
    ],
  },
});
