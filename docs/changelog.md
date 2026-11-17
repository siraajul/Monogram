# Changelog

## T03 — Contract types, zod, validate/visible/price/properties
- `packages/contract`: `Answers`/`SlotItem` schemas, `visibleOptions` (+ `evaluateVisibility`, `selectableValues`), `validate`,
  `priceFor`, `toLineProperties`, `validateOptionSet`, `LINE_PROPERTY` constants.
- Publish now runs `validateOptionSet` (`PublishValidationError`).
- 100% line/branch/function coverage of those files, enforced by `npm run coverage` and CI. 117 unit tests in the contract package.
- Bundle guard: shared functions bundle to ~3.7 KB gz without zod.

## T02 — Prisma schema, models, seed, upload cleanup
- Full Part 02 Prisma schema + migration `data_model`.
- `packages/contract`: zod schemas/types for options, conditions, assignment, preview, draft, product config, settings.
- `app/models`: `shop`, `optionSet` (create/get/list/update/publish stub), shop-scoped, zod-validated.
- Dev seed (`npm run db:seed`): shop, 2 demo fonts, 12-icon library, 3 starter option sets (idempotent).
- Worker: nightly `cleanup-uploads` job (`maintenance` queue) deleting expired, unused uploads and their objects.
- Test infrastructure: real-Postgres `db` project with auto-created test database. 17 tests.

## T01 — Scaffold app, workspaces, DB, Redis, extension, proxy health, CI
- React Router Shopify app scaffold, TypeScript strict, npm workspaces.
- Prisma on PostgreSQL (`init_sessions` migration), docker-compose for Postgres + Redis.
- `worker/` BullMQ worker with a `ping` job on the `render` queue.
- `packages/contract`, `packages/layout` (empty), `packages/widget` (Preact + esbuild -> theme extension assets).
- Theme app extension `personalizer-theme`: app block "Personalizer" and app embed "Personalizer core".
- App proxy route `/proxy/health`.
- GitHub Actions CI: typecheck, lint, tests, widget bundle-size gate (60 KB gz), builds.
