# Decisions

## T01 — Project setup (2026-11-17)

- **Scaffold source.** `npm init @shopify/app@latest` needs `--client-id`/`--organization-id`
  (an interactive Partner login) in non-interactive shells, so the public
  `Shopify/shopify-app-template-react-router` repo was cloned instead (same template).
  `shopify.app.toml` has an empty `client_id`; run `npm run config:link` to link it to your app.
- **API version.** `2026-10` (template default and latest stable at build time). VERIFY at each quarter.
- **Process manager.** npm workspaces (`extensions/*`, `packages/*`, `worker`); the template uses npm.
- **Database.** Template's SQLite swapped for PostgreSQL via `DATABASE_URL`; the old SQLite migration was
  replaced by `init_sessions`. Local Postgres 16 + Redis 7 come from `docker-compose.yml`
  (host ports 5433 / 6380 to avoid clashing with local installs). Docker runtime on this machine is Kiri.
- **npm install scripts.** npm 11 blocks install scripts by default. Allowed: `prisma`, `@prisma/client`,
  `@prisma/engines`, `esbuild`. Denied: `@parcel/watcher`, `msgpackr-extract` (optional native speedups).
  Recorded in `package.json` `allowScripts`.
- **Template webhooks.** Removed the demo `products/update` Events subscription and route. Spec webhooks
  (`orders/*`, `refunds/create`, `products/*`) are added in T19; compliance topics in T37.
  The `app/uninstalled` and `app/scopes_update` handlers are kept.
- **Not generated yet.** `fee-guard` (T18) and `order-block` (Phase 2) extensions are created when their
  tasks start. The theme extension was written by hand (matches `shopify app generate` output for
  `--template theme_app_extension`) because generation requires a linked app. VERIFY by regenerating once linked.
- **Proxy health.** Uses `authenticate.public.appProxy(request)` (confirmed present in
  `@shopify/shopify-app-react-router`). Returns the `shop` query param Shopify adds to proxied requests.
- **Widget assets.** `extensions/personalizer-theme/assets/personalizer.{js,css}` are build output and
  gitignored; run `npm run build:widget` before `shopify app dev` / deploy.
- **CI e2e.** The main-branch Playwright job is a stub gated on repo variable `E2E_ENABLED`; real smoke test lands with T23.

## T02 — Data model (2026-11-17)

- **Order of work.** Part 02 task 2 asks for "zod validation from Part 03", but Part 03 is T03. T02 therefore added
  only the zod schemas it needs to `packages/contract` (options, conditions, assignment, preview, config, settings).
  `Answers`/`SlotItem` and the four functions (`visibleOptions`, `validate`, `priceFor`, `toLineProperties`)
  plus `validateOptionSet` are left for T03.
- **`OptionSetDraft` is not defined in Part 03.** Defined as `ProductConfig` minus the publish-time fields
  (`optionSetId`, `version`, `currency`, `fonts`). `ShopSettings` and `TemplateData` are minimal placeholders that grow in T04/T24.
- **Schema.** Copied from Part 02 as written (plus the template's `Session`); formatting only.
  `ProductAssignment`, `Design`, `OrderLine`, `Upload`, `UsageRecord` have no `Shop` relation in the spec, so
  deleting a shop does not cascade to them. Revisit with the uninstall/redact flows (T22/T37).
- **Version semantics.** A new set has `version = 1` and no `OptionSetVersion` rows. Publish writes
  `max(existing version) + 1` (so the first publish is v1) and sets `OptionSet.version` to it. A concurrent double
  publish is stopped by the `(optionSetId, version)` unique constraint.
- **Publish is a stub.** It validates the draft with zod, snapshots a `ProductConfig` (fonts resolved from the shop's
  `Font` rows), sets `PUBLISHED`. Not yet: `validateOptionSet` (T03), `ProductAssignment` rebuild and metafields (T07), fee mapping (T17).
- **Editing a published set** keeps status `PUBLISHED`; the draft diverges until the next publish.
- **Models** take `shopId` first and filter every query by it; non-matching ids give `null` / `NotFoundError`.
  They use the template's `db.server` singleton; tests point it at a `_test` database (see below).
- **Tests** run against real Postgres, never mocks. `test/global-setup.ts` creates `<db>_test` and runs
  `prisma migrate deploy`; vitest has two projects (`unit` = packages, `db` = app/worker) and file parallelism is off
  because DB tests TRUNCATE between tests.
- **Seed** is run with esbuild + node (`npm run db:seed`), not tsx/ts-node (not in the approved dependency list).
  Idempotent. Demo font URLs are placeholders; the 12 icons are inline SVG data URIs.
  "+$10 for a second name" is a checkbox (`priceAdd: 10`) that shows a second text option through a `show` condition.
  "+$5 fee" on the photo set is `pricePerFile: 5` with `maxFiles: 1`.
- **Cleanup job.** New `maintenance` BullMQ queue (Part 01 lists only `render`/`publish`) with a repeatable job
  `cleanup-uploads` at 03:00 server time. Deletes objects first, then rows; rows whose object failed to delete are
  kept for the next run. Skipped with a warning when `S3_*` env vars are unset. Added `@aws-sdk/client-s3` (in the stack list) to the worker.
  The worker has its own small delete-only storage adapter; the app-side storage service arrives in T13.
- **Workspaces** in `package.json` changed from the template's `{ packages: [...] }` object to a plain array (npm rejects the object form in `npm pkg`).

## T03 — Contract functions (2026-11-17)

Semantics Part 03 leaves open, as implemented (all covered by tests):

- **Visibility.** Option or value with any `show` condition is hidden until one matches; a matching `hide` always wins.
  An empty group (no clauses) never matches. A clause reads the answer of the option it names; if that option is hidden
  the answer counts as empty. Options are resolved depth-first (memoised) rather than in a strict single pass, so a
  condition may point at a later option; a circular config hides the options on the cycle instead of looping.
  Value-level conditions (`target.valueId`) are supported; `visibleOptions` returns option ids, and the new
  `evaluateVisibility` / `selectableValues` expose selectable value ids (used by validate, price, properties, widget).
- **Operators.** `equals`: any answer string equals the value (choice = value id, text = literal, number = String(n)).
  `contains`: choice = id membership, text = case-insensitive substring, else false. `not_equals` = not `equals`.
  `is_empty`: nothing answered / blank text / no choices / no filled slots / no uploads (a number answer is never empty).
- **Text normalisation.** Text is trimmed, then transformed (upper/lower) before validation, pricing and output, so all
  three see identical text. Length counts Unicode code points (an emoji = 1). Length is checked before any
  merchant-supplied regex runs on shopper text; an invalid regex is skipped at runtime and reported at publish.
- **Per-font rules** are keyed by Font id (`OptionValue.fontId`) and override the base rule field by field. **Contract
  addition:** `TextOption.fontOptionId` (optional) says which font option picks the rule; without it the first font option is used.
  For slots, the item's own `fontId` wins, else the option's `fontOptionId`.
- **Optional means skippable.** An optional option left empty is never an error, even with minimums (`minSelect`,
  `minFilled`); once filled, or when required, all rules apply. Required means at least 1 even if the minimum is 0.
- **`validate`** returns at most one issue per option (first failing rule) and adds a `code` next to `optionId`/`message`
  so T30 can translate. Optional 4th argument `{ uploads }` carries Upload metadata (mime, bytes, width, height) for
  accept/size/dimension checks; the spec signature has no place for it. A selected value hidden by a condition is an error.
- **`priceFor`** returns major units rounded to cents, never below 0. Per-character pricing counts non-whitespace characters.
  Slots count filled slots; uploads count distinct files; hidden options and values are not priced.
- **`toLineProperties`** needs `variantGid` in its context (not in the spec) so `variant_is` hides the same options as validate.
  Choice values are written as labels; slots as `Placement N` (empty slots skipped, numbering kept) e.g. `Text: PICKLE (Block, Green)`;
  uploads as URL, else name, else "N files" (optional `ctx.uploads`).
- **`validateOptionSet(draft, ctx)`** returns a list of issues (empty = publishable): condition cycles (option-level only),
  unknown option/value references, missing fonts, empty labels, duplicate ids / property names, reserved names (`_design_id`…),
  invalid regex, min > max, empty choice lists, icon slots without a library, negative prices, and price rules without a fee mapping.
  `ctx.knownFontIds` and `ctx.feeMappingAvailable` carry shop knowledge so the function stays pure.
- **Drafts may have empty labels.** The zod schema no longer requires non-empty labels, so a half-edited draft can be autosaved;
  publish rejects them.
- **Publish now validates.** `publishOptionSet` calls `validateOptionSet` and throws `PublishValidationError` (nothing written).
  Because of the fee-mapping rule, a set that charges extra cannot be published until the shop has a fee product
  (`Shop.feeProductId`, set up in T17). Seeded starter sets "Name necklace" and "Photo gift" are priced, so they stay draft-only until then.
- **Same build in widget and server.** The package is marked `sideEffects: false` and the property-name constants live in
  `constants.ts` (no zod), so a widget importing the four functions bundles to about 3.7 KB gzipped instead of about 97 KB.
  `bundle.test.ts` fails if zod becomes reachable. The widget declares the dependency; it starts using it in T09/T10.
- **Coverage.** Added dev dependency `@vitest/coverage-v8` (approved). `npm run coverage` enforces 100% lines/branches/functions
  on visibility, validate, price, properties, optionSet and util; CI runs it.

## Open VERIFY items
- Theme extension `type = "theme"` and block `target` values against current docs (once linked).
- App embed `target = "body"` vs `"head"` for the core script.
