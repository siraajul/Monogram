# Product Personalizer App — Build Spec for a Coding Agent

A Shopify app with the same capabilities as Zepto Product Personalizer (form options + price add-ons) and Customily (live preview + print-ready files). **Original implementation**: do not copy either app's code, UI text, icons, fonts or templates.

## How to use these files with your coding agent

Give the agent **one part at a time, in order**. Each part is self-contained and ends with tasks and acceptance checks. Do not start a part until the previous part's checks pass.

| # | File | What the agent builds | Phase |
|---|------|------------------------|-------|
| 00 | `00-README.md` | Nothing — read first | — |
| 01 | `01-project-setup.md` | Repo, Shopify app template, tooling, CI | MVP |
| 02 | `02-data-model.md` | Prisma schema, migrations, seed data | MVP |
| 03 | `03-config-contract.md` | Shared TypeScript types + validation (the JSON every part uses) | MVP |
| 04 | `04-admin-app.md` | Merchant admin screens | MVP / v2 |
| 05 | `05-storefront-widget.md` | Theme app extension, option form, cart integration | MVP |
| 06 | `06-preview-engine.md` | Shared layout package + live canvas preview | MVP / v2 |
| 07 | `07-pricing-addons.md` | Add-on fee product, cart guard, optional Cart Transform | MVP |
| 08 | `08-orders-rendering.md` | Webhooks, render worker, print files | MVP / v2 |
| 09 | `09-api-reference.md` | Every endpoint and webhook with request/response shapes | Reference |
| 10 | `10-billing-security-appstore.md` | Billing, security, privacy, App Store checklist | v3 |
| 11 | `11-testing.md` | Unit, snapshot, theme-matrix, load tests | All |
| 12 | `12-roadmap-tasks.md` | Ordered task list with prompts to paste into the agent | All |

## Standing instructions for the agent (paste once at the start)

```text
You are building a Shopify app called "Personalizer" (working name).
Rules:
- TypeScript everywhere, strict mode. No `any` unless commented why.
- Follow the files in /spec in numeric order. The spec wins over your assumptions.
- When a Shopify API detail in the spec is marked VERIFY, check the current
  shopify.dev docs before coding it, and note what you found in /docs/decisions.md.
- Never edit theme files. Storefront code ships only as a theme app extension.
- Every task ends with: code, tests, and a short note in /docs/changelog.md.
- Do not copy code, text or assets from other personalizer apps.
- Keep the storefront bundle under 60 KB gzipped (before the canvas library).
- Ask before adding a dependency not listed in 01-project-setup.md.
```

## Glossary

| Term | Meaning |
|------|---------|
| Option set | A group of options (fields) reused across products |
| Option | One field: text, dropdown, swatch, clipart picker, upload, slot builder… |
| Option value | One choice inside a dropdown/swatch/clipart option |
| Condition | Rule that shows/hides an option or value based on other answers |
| Price rule | Extra charge tied to an option (fixed, per character, per slot, per file) |
| Template | Designer edition: a canvas with views, print areas and layers |
| Print area | A rectangle (or shape) on a product photo where personalization is drawn |
| Layer | Text / image / clipart / shape placed in a print area, optionally bound to an option |
| Design | One shopper's saved answers + canvas state, attached to a cart line |
| Render job | Server task that turns a design into preview and print files after an order |

## Editions

- **Options edition** (Zepto-like): form fields, conditions, price add-ons, simple preview. Parts 01–08 MVP sections.
- **Designer edition** (Customily-like): adds templates, multi-view print areas, print-ready files. The "v2" sections.


---

# Part 01 — Project setup

Goal: a running embedded Shopify app on a development store, with a database, a worker process, a shared package, and CI.

## 1. Stack (do not substitute without asking)

| Layer | Choice |
|-------|--------|
| App framework | Shopify app template (React Router), TypeScript |
| Admin UI | Polaris (web components or React, whichever the template ships) + App Bridge |
| DB | PostgreSQL 15+ via Prisma |
| Queue | BullMQ + Redis |
| Storefront widget | Preact + TypeScript, bundled with esbuild into the theme app extension `assets/` |
| Canvas (browser) | Konva (MVP preview). Fabric.js only for the v2 template editor in admin |
| Render (server) | @napi-rs/canvas, opentype.js, resvg-js, pdf-lib, sharp |
| Storage | S3-compatible (Cloudflare R2 or AWS S3) via `@aws-sdk/client-s3` + presigned URLs |
| Validation | zod |
| Tests | Vitest (unit), Playwright (e2e/theme matrix) |
| Lint/format | ESLint + Prettier |
| Monitoring | Sentry (server + storefront) |

## 2. Repository layout (monorepo, npm or pnpm workspaces)

```
personalizer/
├─ app/                       # Shopify app (React Router) — admin + API routes
│  ├─ routes/
│  ├─ models/                 # DB access functions
│  ├─ services/               # shopify, storage, billing, publishing
│  └─ shopify.server.ts
├─ extensions/
│  ├─ personalizer-theme/     # theme app extension (app block + app embed)
│  │  ├─ blocks/personalizer.liquid
│  │  ├─ blocks/personalizer-embed.liquid
│  │  ├─ assets/              # built widget JS/CSS (output of packages/widget)
│  │  └─ locales/en.default.json
│  ├─ order-block/            # admin UI extension on the order page (v2)
│  └─ fee-guard/              # cart & checkout validation function
├─ packages/
│  ├─ contract/               # shared TS types + zod schemas (Part 03)
│  ├─ layout/                 # shared layout engine (Part 06) — runs in browser AND node
│  └─ widget/                 # storefront Preact source (Part 05) → builds into extensions/personalizer-theme/assets
├─ worker/                    # BullMQ render worker (Part 08)
├─ prisma/schema.prisma
├─ docs/decisions.md
├─ docs/changelog.md
└─ spec/                      # these markdown files
```

## 3. Commands

```bash
# create app (choose the React Router template, TypeScript)
npm init @shopify/app@latest

# generate extensions
shopify app generate extension --template theme_app_extension --name personalizer-theme
shopify app generate extension --template cart_checkout_validation --name fee-guard   # VERIFY template name
shopify app generate extension --template admin_block --name order-block              # v2, VERIFY

# dev
shopify app dev
```

Add workspace packages `packages/contract`, `packages/layout`, `packages/widget`, and `worker/`.

## 4. `shopify.app.toml` essentials (VERIFY field names against current docs)

```toml
[access_scopes]
scopes = "read_products,write_products,read_orders,write_files,read_themes"
# add write_cart_transforms only if Part 07 option B is built

[app_proxy]
url = "https://<your-app-host>/proxy"
prefix = "apps"
subpath = "personalizer"

[webhooks]
api_version = "2026-01"   # use the latest stable version at build time

  [[webhooks.subscriptions]]
  topics = ["orders/create", "orders/updated", "orders/cancelled", "refunds/create",
            "products/update", "products/delete", "app/uninstalled"]
  uri = "/webhooks"

  [[webhooks.subscriptions]]
  compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
  uri = "/webhooks/compliance"
```

## 5. Environment variables

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SCOPES=
DATABASE_URL=postgres://...
REDIS_URL=redis://...
S3_ENDPOINT=            # R2: https://<account>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=personalizer
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
CDN_BASE_URL=           # public URL for assets, previews
SENTRY_DSN=
RENDER_CONCURRENCY=4
```

## 6. Processes

| Process | Command | Notes |
|---------|---------|-------|
| web | React Router server | admin, API, proxy, webhooks |
| worker | `node worker/dist/index.js` | consumes `render` and `publish` queues |
| widget build | `npm -w packages/widget run build -- --watch` | writes to `extensions/personalizer-theme/assets/` |

## 7. CI (GitHub Actions)

- On PR: install, typecheck, lint, unit tests, widget bundle-size check (fail if `personalizer.js` > 60 KB gzipped).
- On main: also run Playwright smoke test against a dev store (secrets in repo settings).

## Tasks

1. Scaffold the app with the React Router template; confirm `shopify app dev` installs it on a dev store.
2. Convert to workspaces; create empty `packages/contract`, `packages/layout`, `packages/widget`, `worker`.
3. Add Prisma + Postgres; add Redis + BullMQ with a `ping` job that logs.
4. Generate the theme app extension; make the widget build write `personalizer.js` and `personalizer.css` into its `assets/`.
5. Add the app proxy route `/proxy/health` returning `{ ok: true, shop }` after verifying the proxy signature (template helper `authenticate.public.appProxy`, VERIFY).
6. Add CI.

## Acceptance checks

- [ ] App installs on a dev store and opens inside Shopify admin.
- [ ] `https://<store>/apps/personalizer/health` returns `{ ok: true, shop: "<store>.myshopify.com" }`.
- [ ] Worker logs the `ping` job.
- [ ] Theme editor shows the app block "Personalizer" and app embed "Personalizer core".
- [ ] CI passes on an empty PR.


---

# Part 02 — Data model

Goal: Prisma schema, migration, and seed data. Everything is scoped by `shopId`.

Merchant setup lives in Postgres. When an option set is **published**, a read-only JSON copy (the `ProductConfig`, Part 03) is written to a **product metafield** on every assigned product, so the storefront reads it with the page and never waits on the API.

## Prisma schema

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// Shopify template session table — keep whatever the template generates.

model Shop {
  id            String   @id @default(cuid())
  domain        String   @unique            // xxx.myshopify.com
  plan          String   @default("free")   // our plan key, see Part 10
  currency      String   @default("USD")
  settings      Json     @default("{}")     // ShopSettings (Part 03)
  feeProductId  String?                      // gid of hidden add-on product (Part 07)
  installedAt   DateTime @default(now())
  uninstalledAt DateTime?
  optionSets    OptionSet[]
  fonts         Font[]
  libraries     AssetLibrary[]
  templates     Template[]
}

enum SetStatus { DRAFT PUBLISHED ARCHIVED }

model OptionSet {
  id           String    @id @default(cuid())
  shopId       String
  shop         Shop      @relation(fields: [shopId], references: [id], onDelete: Cascade)
  name         String
  status       SetStatus @default(DRAFT)
  version      Int       @default(1)        // bumps on every publish
  assignment   Json      @default("{}")     // Assignment (Part 03)
  templateId   String?                       // Designer edition
  draft        Json                          // full OptionSetDraft (Part 03) — single source while editing
  publishedAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  versions     OptionSetVersion[]
  @@index([shopId, status])
}

// Immutable snapshot per publish. Designs reference a version, so editing never breaks old orders.
model OptionSetVersion {
  id          String    @id @default(cuid())
  optionSetId String
  optionSet   OptionSet @relation(fields: [optionSetId], references: [id], onDelete: Cascade)
  version     Int
  config      Json                           // ProductConfig minus product-specific fields
  createdAt   DateTime  @default(now())
  @@unique([optionSetId, version])
}

model ProductAssignment {           // resolved product → option set (rebuilt on publish)
  id          String @id @default(cuid())
  shopId      String
  productGid  String
  optionSetId String
  version     Int
  @@unique([shopId, productGid])
  @@index([optionSetId])
}

model Font {
  id          String @id @default(cuid())
  shopId      String
  shop        Shop   @relation(fields: [shopId], references: [id], onDelete: Cascade)
  family      String
  weight      Int    @default(400)
  style       String @default("normal")
  woff2Url    String                // storefront
  sourceUrl   String                // TTF/OTF for the renderer
  licenseNote String?
  createdAt   DateTime @default(now())
}

enum LibraryType { CLIPART PALETTE }

model AssetLibrary {
  id      String      @id @default(cuid())
  shopId  String
  shop    Shop        @relation(fields: [shopId], references: [id], onDelete: Cascade)
  name    String
  type    LibraryType
  assets  Asset[]
}

model Asset {
  id         String       @id @default(cuid())
  libraryId  String
  library    AssetLibrary @relation(fields: [libraryId], references: [id], onDelete: Cascade)
  name       String
  url        String?             // clipart image (SVG/PNG)
  hex        String?             // palette colour
  tags       String[]
  position   Int          @default(0)
}

// Designer edition (v2)
model Template {
  id        String @id @default(cuid())
  shopId    String
  shop      Shop   @relation(fields: [shopId], references: [id], onDelete: Cascade)
  name      String
  data      Json                 // TemplateData (Part 03): views, printAreas, layers
  updatedAt DateTime @updatedAt
}

model Upload {
  id         String   @id @default(cuid())
  shopId     String
  key        String   @unique    // storage key
  mime       String
  bytes      Int
  width      Int?
  height     Int?
  usedByDesignId String?
  expiresAt  DateTime            // now + 30 days unless used by an order
  createdAt  DateTime @default(now())
  @@index([expiresAt])
}

model Design {
  id              String   @id @default(cuid())
  shopId          String
  productGid      String
  variantGid      String
  optionSetId     String
  optionSetVersion Int
  answers         Json                 // Answers (Part 03)
  canvas          Json?                // Designer edition state
  previewKey      String?              // storage key of preview PNG/WebP
  accessToken     String               // random, stored on cart line as _design_token
  createdAt       DateTime @default(now())
  @@index([shopId, createdAt])
}

enum JobStatus { QUEUED RUNNING DONE FAILED CANCELLED }

model OrderLine {
  id             String    @id @default(cuid())
  shopId         String
  orderGid       String
  orderName      String               // "#1001"
  lineItemGid    String    @unique
  designId       String?
  quantity       Int
  status         JobStatus @default(QUEUED)
  outputs        Json      @default("[]")   // RenderOutput[] (Part 08)
  error          String?
  attempts       Int       @default(0)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@index([shopId, createdAt])
}

model UsageRecord {
  id          String   @id @default(cuid())
  shopId      String
  orderLineId String   @unique
  amountCents Int
  shopifyUsageId String?
  createdAt   DateTime @default(now())
  reversedAt  DateTime?
}
```

## Metafields written to Shopify

| Owner | Namespace / key | Type | Content |
|-------|-----------------|------|---------|
| Product | `$app:personalizer` / `config` | json | `ProductConfig` (Part 03). Create a **metafield definition** with storefront access so Liquid can read it. VERIFY how app-reserved namespaces are read from a theme app extension block; fallback: namespace `personalizer` |
| Order | `$app:personalizer` / `files` | json | `RenderOutput[]` per line (Part 08) |
| Shop | `$app:personalizer` / `settings` | json | public widget settings (labels, accent) |

Max metafield JSON size is limited by Shopify (VERIFY current limit). If a config exceeds it, store the config in the CDN as `configs/<shop>/<productId>-v<version>.json` and put `{ "url": "..." }` in the metafield instead.

## Seed data (dev only)

Create one shop row for the dev store and three starter option sets (also offered in onboarding, Part 04):

1. **Name necklace**: text (max 10, letters only), font picker (Script, Block), metal swatch (Gold, Silver, Rose), +$10 for a second name.
2. **Monogram tote**: slot builder with 6 slots (text / letter / icon), 12 thread colours, 12 demo icons.
3. **Photo gift**: upload (JPG/PNG, max 15 MB), text caption (max 30), +$5 fee.

## Tasks

1. Write the schema above; run the first migration.
2. Add model functions in `app/models/` (create, get, list, update, publish stub) with zod validation from Part 03.
3. Write the seed script.
4. Add a nightly job: delete `Upload` rows and objects where `expiresAt < now()` and `usedByDesignId` is null.

## Acceptance checks

- [ ] `prisma migrate dev` runs clean; seed creates 3 option sets.
- [ ] Unit tests cover create → update → publish (version increments, a `OptionSetVersion` row is written).
- [ ] Cleanup job deletes expired, unused uploads in a test.


---

# Part 03 — Config contract (shared types)

Goal: one package, `packages/contract`, that defines every JSON shape shared by admin, storefront, worker and API. Write these as TypeScript types **and** zod schemas (export both). Every other part imports from here.

## Option types

```ts
export type OptionType =
  | "text" | "textarea" | "number"
  | "dropdown" | "radio" | "checkbox"
  | "swatch"            // colour or image swatches
  | "font"              // font picker
  | "clipart"           // icon grid from an asset library
  | "slots"             // N ordered placements; each = text | letter | icon
  | "upload"            // file upload
  | "date"              // v2
  | "hidden";           // v2, value set by rules

export interface OptionValue {
  id: string;
  label: string;
  value: string;            // stored value
  hex?: string;             // swatch colour
  imageUrl?: string;        // swatch image or clipart
  fontId?: string;          // for "font" options
  priceAdd?: number;        // in shop currency, major units (e.g. 5 = $5)
}

export interface BaseOption {
  id: string;
  type: OptionType;
  label: string;            // shown to shopper; also the line-item property name
  helpText?: string;
  required: boolean;
  hiddenFromCart?: boolean; // if true, property name gets "_" prefix
  bindTo?: string;          // layer id in the preview (Part 06)
}

export interface TextOption extends BaseOption {
  type: "text" | "textarea";
  placeholder?: string;
  minLength?: number;
  maxLength: number;
  maxLines?: number;                 // textarea
  allowed?: string;                  // regex source, e.g. "^[A-Za-z ]*$"
  transform?: "none" | "upper" | "lower";
  perFontRules?: Record<string, { maxLength?: number; allowed?: string; transform?: "upper" | "lower" }>;
  pricePerChar?: number;
}

export interface ChoiceOption extends BaseOption {
  type: "dropdown" | "radio" | "checkbox" | "swatch" | "font" | "clipart";
  values: OptionValue[];
  libraryId?: string;                // clipart: values filled from library on publish
  minSelect?: number;                // checkbox
  maxSelect?: number;
  display?: "grid" | "list" | "pills";
}

export interface SlotsOption extends BaseOption {
  type: "slots";
  slotCount: number;                 // e.g. 6
  minFilled: number;                 // e.g. 1
  kinds: Array<"text" | "letter" | "icon">;
  text: { maxLength: number; perFontRules?: TextOption["perFontRules"] };
  fontOptionId?: string;             // which font option styles text/letter slots
  colorOptionId?: string;            // which swatch option colours text/letter slots
  iconLibraryId?: string;
  pricePerSlot?: number;
}

export interface UploadOption extends BaseOption {
  type: "upload";
  accept: string[];                  // ["image/jpeg","image/png"]
  maxBytes: number;
  minWidth?: number; minHeight?: number;
  maxFiles: number;
  pricePerFile?: number;
  crop?: { aspect: number };         // v2
}

export interface NumberOption extends BaseOption {
  type: "number"; min: number; max: number; step: number;
}

export type Option = TextOption | ChoiceOption | SlotsOption | UploadOption | NumberOption;
```

## Conditions

```ts
export type Operator = "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty" | "variant_is";

export interface Clause {
  optionId?: string;        // omit when operator = variant_is
  operator: Operator;
  value?: string;           // value id, literal text, or variant gid
}

export interface ConditionGroup { all?: Clause[]; any?: Clause[] }   // AND / OR

export interface Condition {
  id: string;
  target: { optionId: string; valueId?: string };   // valueId → hide/show just that value
  action: "show" | "hide";
  when: ConditionGroup;
}
```

Rules:
- An option with any `show` condition is hidden by default and shown when a condition matches.
- Hidden options are not validated, not priced, not sent to the cart.
- Evaluate in one pass in option order; no circular references (validator rejects cycles on publish).

## Answers (what the shopper chose)

```ts
export type SlotItem =
  | { kind: "text"; text: string; fontId?: string; colorValueId?: string }
  | { kind: "letter"; text: string; fontId?: string; colorValueId?: string }
  | { kind: "icon"; assetId: string; name: string };

export type AnswerValue =
  | { type: "text"; text: string }
  | { type: "choice"; valueIds: string[] }
  | { type: "slots"; items: Array<SlotItem | null> }   // length = slotCount, null = empty
  | { type: "upload"; uploadIds: string[] }
  | { type: "number"; value: number };

export type Answers = Record<string /* optionId */, AnswerValue>;
```

## Product config (published to the product metafield)

```ts
export interface ProductConfig {
  schema: 1;
  optionSetId: string;
  version: number;
  currency: string;                 // shop currency
  options: Option[];
  conditions: Condition[];
  fonts: Array<{ id: string; family: string; woff2Url: string; weight: number; style: string }>;
  preview?: PreviewConfig;          // Part 06
  pricing: { mode: "fee_product" | "cart_transform"; feeVariantMap?: Record<string, string> }; // Part 07
  ui: { accent?: string; radius?: number; showPriceLine: boolean; addToCartGuardText: string };
}

export interface PreviewConfig {
  mode: "simple" | "template";
  views: Array<{
    id: string;
    name: string;                         // "Front"
    imageByVariant?: Record<string, string>;   // variant gid → photo URL; else use product's featured image
    printAreas: PrintArea[];
  }>;
}

export interface PrintArea {
  id: string;
  // position as fractions of the photo (0..1) so it works at any display size
  x: number; y: number; w: number; h: number; rotation: number;
  clip?: "rect" | "ellipse";
  output?: { widthPx: number; heightPx: number; dpi: number };   // print file size (Part 08)
  layout: "row" | "column" | "free";      // "row": slots laid left→right
  layers: Layer[];
}

export interface Layer {
  id: string;
  type: "text" | "image" | "clipart" | "slots";
  bindOptionId?: string;                  // which option drives it
  x: number; y: number; w: number; h: number; rotation: number;   // fractions of the print area
  text?: { fontId?: string; size: number; minSize: number; color: string; align: "left" | "center" | "right"; fit: "shrink" | "wrap" | "none"; curve?: number };
}
```

## Assignment

```ts
export interface Assignment {
  productGids?: string[];
  collectionGids?: string[];
  tags?: string[];
  vendors?: string[];
  excludeProductGids?: string[];
  priority: number;          // higher wins when two sets match one product
}
```

## Cart line properties (exact names)

| Property | Example | Visible to shopper |
|----------|---------|--------------------|
| `<Option label>` | `Name: Maya` | yes |
| `Placement 1`…`Placement N` (slots) | `Text: PICKLE (Block, Green)` | yes |
| `_design_id` | `ckx…` | no |
| `_design_token` | random 32 chars | no |
| `_preview` | CDN URL of preview image | no |
| `_set` | `<optionSetId>:v<version>` | no |
| `_group` | random id linking product line to its fee line | no |

## Validation functions (in this package, used by widget AND server)

```ts
export function visibleOptions(config: ProductConfig, answers: Answers, variantGid: string): Set<string>;
export function validate(config: ProductConfig, answers: Answers, variantGid: string): Array<{ optionId: string; message: string }>;
export function priceFor(config: ProductConfig, answers: Answers, variantGid: string): number;  // add-on total, major units
export function toLineProperties(config: ProductConfig, answers: Answers, ctx: { designId: string; token: string; previewUrl?: string; group: string }): Record<string, string>;
```

## Tasks

1. Implement the types + zod schemas.
2. Implement `visibleOptions`, `validate`, `priceFor`, `toLineProperties`.
3. Add `validateOptionSet(draft)` for publish: rejects condition cycles, missing fonts, values without labels, price rules without a fee mapping.

## Acceptance checks

- [ ] 100% unit test coverage of the four functions, including: hidden option not validated/priced; per-font rules; slots min filled; checkbox min/max; upload limits.
- [ ] Server and widget import the same build of this package.


---

# Part 04 — Merchant admin

Goal: the embedded admin where merchants build option sets, manage assets, assign products and see personalised orders. Target: install → working personalised product in **under 10 minutes**.

All screens use Polaris + App Bridge, run embedded in Shopify admin, and authenticate with session tokens (template default).

## Navigation

```
Home (onboarding / dashboard)
Option sets
  └ Option set builder (/sets/:id)
Libraries (Fonts · Clipart · Palettes)
Templates (v2)
Orders
Settings (+ Plan & billing in v3)
```

## Screens

### 1. Home / Onboarding (MVP)
- Checklist with 3 steps, each showing done/not done:
  1. **Enable the app embed** — button opens the theme editor deep link to activate "Personalizer core" (VERIFY deep-link format: `https://<shop>/admin/themes/current/editor?context=apps&activateAppId=<api_key>/<embed_handle>`). Detect status by reading the theme's `settings_data.json` via Admin API (needs `read_themes`).
  2. **Create your first option set** — pick a starter (Name necklace, Monogram tote, Photo gift, Blank).
  3. **Assign it to a product and publish** — product picker (App Bridge resource picker).
- After setup: cards with personalised orders this month, top products, render failures.

### 2. Option sets list (MVP)
- Polaris index table: Name, Status badge, Products assigned (count), Version, Updated.
- Row actions: Edit, Duplicate, Publish/Unpublish, Archive.
- Filters: status. Search by name.

### 3. Option set builder (MVP) — the main screen
Three-column layout on desktop, stacked on mobile:

| Left (240px) | Centre | Right (360px) |
|---|---|---|
| **Option palette**: buttons for each option type | **Option list**: drag to reorder; click to select; each row shows icon, label, type, required badge, condition badge, price badge | **Settings panel** for the selected option (fields depend on type, Part 03) + **Live preview** tab rendering the real widget with the draft config |

Builder features:
- Autosave the draft every 2 s after the last change (debounced `PUT /api/sets/:id/draft`).
- Undo/redo (last 50 changes) — keep a client-side history of drafts.
- **Conditions tab**: list conditions; editor = target (option or value) + show/hide + clause rows (option, operator, value) + ALL/ANY toggle.
- **Pricing tab**: per option price rules; shows the fee mode (Part 07).
- **Preview tab** (simple preview, MVP): upload or choose the product photo, drag a rectangle for the print area, pick which options draw into it (Part 06).
- **Publish** button → runs `validateOptionSet`; shows errors inline; on success bumps version, writes `OptionSetVersion`, resolves assignment and writes product metafields (bulk if > 50 products, see below).
- **Assignment tab**: products, collections, tags, vendors, excludes, priority; shows conflicts ("3 products also match 'Tote set'; this set wins because priority 10 > 5").

Publishing to many products:
- ≤ 50 products: `metafieldsSet` in batches of 25 (VERIFY batch limit).
- > 50: enqueue a `publish` job; worker uses a bulk mutation (VERIFY `bulkOperationRunMutation` with `metafieldsSet`) and reports progress via polling `GET /api/sets/:id/publish-status`.
- Re-resolve assignments when `products/update` webhooks change tags/collections (debounced per shop, every 5 minutes).

### 4. Libraries (MVP)
- **Fonts**: upload TTF/OTF/WOFF2 (max 5 MB). Server converts to WOFF2 for storefront if needed (use a node lib; VERIFY choice, e.g. `wawoff2`), stores both, extracts family/weight with opentype.js. Show a sample line rendered in the font. Field for license note. Warn: "Only upload fonts you are licensed to embed and use for production."
- **Clipart**: create libraries; bulk upload SVG/PNG (max 500 files per library, 2 MB each); SVGs are sanitized on upload (strip scripts, event handlers, external refs); tags; reorder.
- **Palettes**: named colours (name + hex).

### 5. Templates (v2)
- Fabric.js editor in admin: product photo as background per view; draw print areas (rect/ellipse); add layers (text, image, clipart, slots); bind each layer to an option; set output size (px + DPI) per print area.
- Save → `PUT /api/templates/:id`, stored as `TemplateData` (Part 03 `PreviewConfig` shape).

### 6. Orders (MVP preview; v2 files)
- Index table of `OrderLine`: order name, product, preview thumbnail, status, created.
- Detail drawer: all answers, preview image, download buttons for each output, **Re-render**, **Edit answers** (v3: edit → re-render → updates order metafield).
- Also ship an **admin order block** extension (v2) on Shopify's order page showing previews and file links.

### 7. Settings (MVP)
- Widget: accent colour, corner radius, "Add to cart" guard text, show price line.
- Files: retention days for orders (default 365) and abandoned uploads (default 30).
- Notifications: email on render failure.
- Integrations (v3): Printful, Printify, Gelato, custom webhook URL.
- Plan & billing (v3, Part 10).

## Admin API routes (implemented in `app/routes/api.*`)

See Part 09 for request/response shapes.

## Tasks

1. Build navigation and the Option sets list.
2. Build the builder with palette, list (drag reorder), settings panel per type, autosave, undo/redo.
3. Build conditions and pricing tabs.
4. Build publish flow (small + bulk), assignment resolution, conflict display.
5. Build Libraries (fonts, clipart, palettes) with upload to storage via presigned URLs.
6. Build Onboarding with app-embed detection and starter sets.
7. Build Orders list + detail drawer.
8. Build Settings.

## Acceptance checks

- [ ] A new merchant completes onboarding and sees the widget on a product in under 10 minutes (timed test).
- [ ] Publishing a set assigned to a collection of 300 products completes and every product has the metafield.
- [ ] Builder survives reload mid-edit with no lost changes.
- [ ] Uploading a malicious SVG (with `<script>` / `onload`) stores a clean file.


---

# Part 05 — Storefront widget (theme app extension)

Goal: the shopper-facing form + preview, installed through the theme editor in any Online Store 2.0 theme, with no theme code edits.

## Extension files

```
extensions/personalizer-theme/
├─ blocks/
│  ├─ personalizer.liquid          # app block (target: section) — placed in product info
│  └─ personalizer-embed.liquid    # app embed (target: body) — loads core script once per page
├─ assets/
│  ├─ personalizer.js              # built from packages/widget (Preact)
│  ├─ personalizer.css
│  └─ personalizer-canvas.js       # lazy chunk: Konva + layout engine (Part 06)
└─ locales/en.default.json
```

### `personalizer.liquid` (app block)

Responsibilities:
- Only render on product pages with a config.
- Print a mount element and inline the config + context as JSON (no network call needed to start).

```liquid
{%- liquid
  assign cfg = product.metafields['$app:personalizer'].config   # VERIFY access syntax; fallback product.metafields.personalizer.config
-%}
{%- if cfg != blank -%}
  <div class="pz-root"
       data-pz
       data-product-id="{{ product.id }}"
       data-section-id="{{ section.id }}">
    <script type="application/json" data-pz-config>{{ cfg.value | json }}</script>
    <script type="application/json" data-pz-context>
      {
        "productId": {{ product.id | json }},
        "variants": {{ product.variants | map: 'id' | json }},
        "selectedVariant": {{ product.selected_or_first_available_variant.id | json }},
        "moneyFormat": {{ shop.money_format | json }},
        "featuredImage": {{ product.featured_image | image_url: width: 1600 | json }},
        "locale": {{ request.locale.iso_code | json }}
      }
    </script>
    <div class="pz-skeleton" aria-hidden="true"></div>
  </div>
{%- endif -%}

{% schema %}
{
  "name": "Personalizer",
  "target": "section",
  "enabled_on": { "templates": ["product"] },
  "settings": [
    { "type": "checkbox", "id": "show_preview", "label": "Show live preview on product image", "default": true },
    { "type": "select", "id": "layout", "label": "Layout", "options": [
      { "value": "stacked", "label": "Stacked" }, { "value": "tabs", "label": "Tabs" } ], "default": "stacked" }
  ]
}
{% endschema %}
```

### `personalizer-embed.liquid` (app embed)

```liquid
<link rel="stylesheet" href="{{ 'personalizer.css' | asset_url }}">
<script src="{{ 'personalizer.js' | asset_url }}" defer></script>
<script>window.__PZ__ = { canvasSrc: {{ 'personalizer-canvas.js' | asset_url | json }}, proxy: "/apps/personalizer" };</script>
{% schema %}
{ "name": "Personalizer core", "target": "body", "settings": [] }
{% endschema %}
```

If the merchant added the block but not the embed, the block should still work: the block checks `window.__PZ__` and injects the script itself if missing.

## Widget source (`packages/widget`)

```
src/
├─ index.ts              # find [data-pz] roots, mount, observe new roots (quick-view)
├─ state.ts              # answers store, derived visibility/price/errors (uses packages/contract)
├─ form/
│  ├─ Form.tsx           # renders visible options in order
│  ├─ TextField.tsx  Dropdown.tsx  Radio.tsx  Checkbox.tsx  Swatches.tsx
│  ├─ FontPicker.tsx  ClipartGrid.tsx  Slots.tsx  Upload.tsx  NumberField.tsx
│  └─ PriceLine.tsx      # "+ $10.00 personalization"
├─ cart/
│  ├─ findForm.ts        # locate the product form
│  ├─ syncInputs.ts      # write hidden properties[...] inputs
│  └─ guard.ts           # submit interception + design save
├─ preview/
│  └─ mountPreview.ts    # lazy-load personalizer-canvas.js, overlay main image
├─ api.ts                # proxy calls: uploads, designs
├─ money.ts              # format with shop money_format
└─ i18n.ts
```

### Behaviour

1. **Mount**: parse config + context; render the form immediately (target: visible within 300 ms of script execution). Initial answers = defaults.
2. **Variant tracking**: listen for `change` on the product form and for URL `?variant=` changes (patch `history.replaceState`/`pushState` + `popstate`). Update `variantGid`; re-evaluate conditions (`variant_is`) and preview image (`imageByVariant`).
3. **Each change**: update answers → recompute visibility, errors (only show an error after the field was touched or on submit), add-on price → re-render → `syncInputs` → notify preview.
4. **Slots option**: tap an item (text via input + Add, letter grid, icon grid) to fill the next empty slot; drag to reorder (pointer events, works on touch); ◀ ▶ buttons for keyboard/accessibility; × to clear.
5. **Upload option**: `POST {proxy}/uploads` → `{ uploadId, putUrl, publicUrl }`; `PUT` the file directly to storage with progress; show thumbnail; client-side checks of type/size/dimensions before upload; server re-checks.
6. **Fonts**: inject `@font-face` for config fonts on first interaction; font picker shows each name in its face.

### Finding the product form (`findForm.ts`)

```ts
// The form that adds THIS product: action contains /cart/add and its [name="id"] is one of our variant ids.
export function findForms(variantIds: number[]): HTMLFormElement[] {
  return [...document.querySelectorAll<HTMLFormElement>('form[action*="/cart/add"]')]
    .filter(f => {
      const id = f.querySelector<HTMLInputElement | HTMLSelectElement>('[name="id"]');
      return id && variantIds.includes(Number(id.value));
    });
}
```
Re-scan on DOM changes (MutationObserver on `document.body`, throttled) because themes re-render forms on variant change.

### Syncing properties (`syncInputs.ts`)

- Remove previous `[data-pz-prop]` inputs in each form; add one `<input type="hidden" data-pz-prop name="properties[...]">` per entry from `toLineProperties()` (Part 03).
- Hidden options are not sent.

### Submit guard (`guard.ts`)

```text
document.addEventListener("submit", handler, true)   // capture phase, runs before theme handlers
handler:
  if form not ours → return
  errors = validate(...)
  if errors → preventDefault + stopImmediatePropagation, show errors, focus first invalid field
  else if design not saved for current answers →
       preventDefault + stopImmediatePropagation
       POST {proxy}/designs (answers, variant, setVersion, preview PNG if available)
       on success: set _design_id/_design_token/_preview inputs
       on failure (timeout 4s): continue without design id (readable properties still saved)
       then: add fee line if needed (Part 07) and re-submit the form via form.requestSubmit()
       (set a flag so the guard lets the second submit through)
```

Many themes add to cart with `fetch` using `new FormData(form)`; injected inputs are included automatically. Test this in the theme matrix (Part 11).

### Edit from cart (v2)
- Cart line shows "Edit personalization" link → product URL with `?pz_design=<id>&pz_token=<token>`; widget loads `GET {proxy}/designs/:id?token=` and pre-fills answers; on submit replaces the line (cart `change.js` + `add.js`).

## UX rules

- Mobile first (360 px wide). Tap targets ≥ 44 px.
- Every field: visible label, help text, error text linked with `aria-describedby`; errors announced with `aria-live="polite"`.
- Price line updates live: "Personalization: +$10.00" next to the add to cart area (or inside the widget if not found).
- Respect theme typography: inherit `font-family` and colours from the block; only accent and radius come from settings.
- No layout shift: skeleton reserves height until the form renders.

## Performance budget

| Item | Budget |
|------|--------|
| `personalizer.js` (gzipped) | ≤ 60 KB |
| `personalizer-canvas.js` (gzipped) | ≤ 120 KB, loaded lazily |
| Form visible after script runs | ≤ 300 ms on a mid-range phone |
| CLS added | ≤ 0.05 |

## Tasks

1. Liquid block + embed; mount and render a text option from inline config.
2. All MVP option components with the contract's validation.
3. Variant tracking + conditions.
4. Slots option with drag/reorder.
5. Uploads with presigned URLs.
6. Form finding, property sync, submit guard, design save.
7. Price line.
8. Accessibility pass.

## Acceptance checks

- [ ] On Dawn and one Horizon theme: properties appear in `/cart.js` for every option type.
- [ ] Add to cart is blocked with a visible, announced error when required fields are empty.
- [ ] Quick-add/quick-view modal on a collection page works (or the widget hides itself cleanly if the theme's quick view cannot host it).
- [ ] Bundle-size budget enforced in CI.


---

# Part 06 — Preview engine (shared layout)

Goal: one layout package (`packages/layout`) that decides **where every glyph and icon goes**. The browser draws its output with Konva for the live preview; the worker draws the same output with @napi-rs/canvas for print files. Same input → same layout, so the order file matches what the shopper saw.

## Principle

```
Answers + PreviewConfig + fonts  ──►  layout()  ──►  DrawList (pure data)
                                                     │
                     browser: drawKonva(DrawList)  ◄─┤
                     server:  drawCanvas(DrawList) ◄─┘   (and drawSvg for vector output)
```

`layout()` is pure TypeScript with no DOM: it gets font metrics from an injected `measure()` function (browser: canvas `measureText` after `document.fonts.load`; server: opentype.js on the same font file). Tolerance between the two: ≤ 1% width.

## Types

```ts
export interface LayoutInput {
  area: PrintArea;                    // from contract (Part 03)
  areaPx: { width: number; height: number };   // target pixel size (display or print)
  answers: Answers;
  config: ProductConfig;
  fonts: FontRegistry;                // id → { family, measure(text, sizePx) => { width, ascent, descent } }
  assets: AssetRegistry;              // assetId → { url, width, height, isSvg }
}

export type DrawItem =
  | { kind: "text"; text: string; fontId: string; sizePx: number; color: string; x: number; y: number; rotation: number; align: "left" | "center" | "right"; curve?: number }
  | { kind: "image"; assetUrl: string; x: number; y: number; w: number; h: number; rotation: number };

export interface DrawList { width: number; height: number; clip: "rect" | "ellipse"; items: DrawItem[] }

export function layout(input: LayoutInput): DrawList;
```

## Layout rules

### Text layer (`fit`)
- `shrink` (default): start at `size`; reduce by 1 px until the text fits the layer box width (and height for multi-line); stop at `minSize`. If still too wide → the validator should already have blocked it (max length); draw at `minSize` anyway.
- `wrap`: break at spaces; max lines = floor(h / lineHeight); then shrink.
- `none`: draw at size, clip to area.
- `align` within the layer box; baseline = vertical centre + (ascent − descent)/2.
- `curve` (v2): arc text, radius = layer width / (curve × π); place each glyph along the arc by its advance width.

### Slots layer (`layout: "row"`)
- Filled slots only, in order. Each item gets an equal cell: `cellW = areaW / filledCount` (min gap 4% of area width).
- Text/letter item: rendered as a text layer inside its cell (shrink fit).
- Icon item: image fitted inside the cell keeping aspect ratio, max 80% of cell height.
- Optional `layout: "column"` stacks vertically; `free` uses each layer's own box.

### Image (uploads, v2 crop)
- Cover-fit into the layer box, centred; crop rectangle from the answer if present.

## Browser preview (`packages/widget/src/preview`)

1. Find the main product image: try, in order, a per-theme override selector, `[data-media-id] img` inside the first product media, the largest visible `img` in the product section. VERIFY on the theme matrix.
2. Wrap it in a positioned container (do not move it); add a Konva stage absolutely positioned over the image with the same size; resize with `ResizeObserver`.
3. Convert the print area fractions to pixels of the displayed image; call `layout()` with `areaPx` = displayed size; draw.
4. Redraw on answer change via `requestAnimationFrame` (max one draw per frame).
5. When the shopper changes the variant, swap to `imageByVariant` photo if configured.
6. Before add to cart, export a preview PNG (`stage.toDataURL({ pixelRatio: 2 })`, max 1000 px wide) and send it with the design save.
7. If the image cannot be found, show the preview in a box inside the widget instead.

Fonts: before the first draw, `await document.fonts.load('32px "<family>"')` for every font used; show a light shimmer until ready.

## Server drawing (`worker/src/draw`)

- `drawCanvas(DrawList, scale)` → PNG with transparent background at print size (Part 08).
- `drawSvg(DrawList)` → SVG with text converted to paths via opentype.js (for engraving/cutting).
- Register fonts with @napi-rs/canvas `GlobalFonts.registerFromPath` using the source TTF/OTF.

## Snapshot tests (required)

- 20 reference designs (fixtures) covering: long/short names, script vs block, 1–6 slots, icons, uploads, curve.
- For each: run `layout()` with server metrics and with browser metrics (Playwright) → compare DrawLists (positions within 1%) and compare rendered PNGs (pixelmatch threshold 0.1, ≤ 0.5% differing pixels).

## Tasks

1. Implement `layout()` for text (shrink/wrap/none) and slots (row).
2. Implement `measure()` for browser and server.
3. Browser overlay with Konva, resize handling, variant photo swap, PNG export.
4. Server `drawCanvas` and `drawSvg`.
5. Snapshot test suite.
6. (v2) curve text, column/free layouts, multi-view switching (thumbnails under the image), image crop.

## Acceptance checks

- [ ] Typing a name updates the preview within one frame; no flicker.
- [ ] Print PNG for each fixture matches the browser preview per the snapshot thresholds.
- [ ] Preview works on Dawn and Horizon; falls back to an in-widget box elsewhere.


---

# Part 07 — Pricing add-ons

Goal: charge extra for personalization on every Shopify plan.

Shopify limits the price-changing Cart Transform `lineUpdate` operation to Shopify Plus and development stores (see shopify.dev Cart Transform docs; VERIFY at build time). So the **default** is a hidden fee product. Cart Transform is an optional upgrade.

## Option A (default): hidden fee product — all plans

### Setup (on install, and repairable from Settings)
1. Create product "Personalization" (title configurable), status ACTIVE, **not** published to the Online Store sales channel's collections/search (VERIFY: publish only so it can be added to cart, hide from search with `seo.hidden` metafield or `templateSuffix`), no inventory tracking, requires shipping = false, taxable = true.
2. Create variants for denominations so any amount can be built with few lines: **$0.01, $0.10, $1, $10, $100** (in shop currency). Store their variant ids in `Shop.settings.feeVariants`.
   - Alternative (simpler, recommended for MVP): one $0.01 variant with quantity = cents. Downside: quantity shows e.g. "× 1000". Use denominations if the cart shows quantities prominently.
3. Save `Shop.feeProductId`.

### Adding the fee
In the submit guard (Part 05), after the design is saved and when `priceFor() > 0`:

```ts
await fetch("/cart/add.js", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ items: [
    { id: productVariantId, quantity: qty, properties: { ...props, _group: group } },
    ...feeLines(amount * qty).map(f => ({ id: f.variantId, quantity: f.qty,
        properties: { _pz_fee_for: group, "For": productTitle } }))
  ]})
});
```
Then trigger the theme's cart refresh: dispatch common events (`cart:refresh`, `cart:updated`), and if the theme has a cart drawer custom element with a known refresh method use the per-theme override; else navigate to `/cart`.

Because this replaces the theme's own add-to-cart call, only do it when a fee is due. When no fee, let the theme submit normally.

### Keeping fee lines honest
- **Orphan cleanup (storefront)**: on every page load, the embed fetches `/cart.js`; any fee line whose `_pz_fee_for` group has no product line → `change.js` quantity 0. Fee quantity follows product quantity changes.
- **Checkout guard (server-side, required)**: Cart & checkout validation Function `fee-guard`:
  - Error if a fee line exists without a matching `_group` product line.
  - Error if the fee total for a group is less than the recomputed expected amount (send expected cents as a hidden property `_pz_fee_cents` on the product line, signed with HMAC of `group|cents|shop` using an app secret stored in a shop metafield the function can read — VERIFY function input access to metafields).
- Discounts: by default exclude the fee product from automatic discounts (document for merchants).

## Option B (optional): Cart Transform

- `lineExpand`: expand the personalised line into [product, fee] components so the cart shows one line. Available beyond Plus (VERIFY current plan rules).
- `lineUpdate`: set the line price = product price + fee. **Plus and dev stores only.**
- Implement as Function `price-transform` reading `_pz_fee_cents` (+ signature) from line attributes.
- Setting in admin: "Pricing mode: Fee product (all plans) / Single cart line (requires eligible plan)". Detect plan via `shop.plan` and only enable B when eligible.

## Money handling

- All prices stored in shop currency, major units in config, integer cents everywhere else.
- Display with `shop.money_format`; for multi-currency stores, multiply by `Shopify.currency.rate` for display only; the fee variant price converts automatically at checkout.

## Tasks

1. Fee product creation + repair action.
2. `feeLines(cents)` greedy denomination splitter + tests.
3. Submit-path fee add + cart refresh hooks.
4. Orphan cleanup in the embed.
5. `fee-guard` validation function.
6. (Optional) Cart Transform function + admin setting.

## Acceptance checks

- [ ] Personalised product with +$12.50 fee → cart total increases by exactly $12.50 × quantity.
- [ ] Removing the product removes its fee line on next page load; checkout with only a fee line is blocked by the function.
- [ ] Tampering `_pz_fee_cents` in the browser is rejected at checkout.


---

# Part 08 — Orders, rendering and production files

Goal: every personalised line item has a preview within 1 minute of the order and print files within 5 minutes, linked on the Shopify order.

## Flow

1. `orders/create` webhook → verify HMAC (template does this) → store raw payload id → respond 200 fast (< 5 s). Do the rest in a queue job `ingest-order`.
2. `ingest-order`: for each line item with property `_design_id`:
   - check `_design_token` matches `Design.accessToken` (reject spoofed ids)
   - upsert `OrderLine` (unique by `lineItemGid`), mark the design's uploads as used (`usedByDesignId`, extend `expiresAt` to retention)
   - enqueue `render` job (`jobId = lineItemGid` for idempotency)
   - record usage for billing (Part 10)
3. `render` job (worker):
   - load Design, OptionSetVersion config, fonts (download source files to a local cache dir keyed by font id), assets, uploads
   - for each view and print area with `output` set: `layout()` at output px → outputs (below)
   - upload to storage `orders/<shop>/<orderNumber>/<lineItemId>/<view>-<area>.<ext>`
   - update `OrderLine.outputs`, status DONE
   - write order metafield `$app:personalizer.files` (merge per line) and, if enabled, append a short order note line "Personalization files: <admin link>"
   - if integrations enabled → enqueue `deliver` job
4. Failures: BullMQ retries 3× with exponential back-off (30 s, 2 min, 10 min); then status FAILED, email merchant (daily digest + immediate for first failure), show in admin with Re-render.

## Outputs

```ts
export interface RenderOutput {
  view: string; area: string;
  kind: "preview" | "print_png" | "print_svg" | "proof_pdf" | "thread_sheet";
  url: string;            // signed or CDN URL
  widthPx?: number; heightPx?: number; dpi?: number;
  bytes: number;
}
```

| Kind | When | Spec |
|------|------|------|
| preview | always | WebP, 1000 px wide, design drawn on the product photo |
| print_png | area has `output` | Transparent PNG at `widthPx × heightPx`, DPI metadata set (sharp `withMetadata({ density })`), sRGB |
| print_svg | merchant setting "vector output" | Text as paths (opentype.js), clipart SVGs inlined, images embedded |
| proof_pdf | always (v2) | A4/Letter, preview + table of answers + order name; fonts embedded (pdf-lib + fontkit) |
| thread_sheet | embroidery products (setting) | PDF listing thread colours per placement |

Embroidery machine formats (DST/PES) are **out of scope**; they require digitising. Provide SVG/PNG + thread sheet for the digitiser.

## Order changes

| Webhook | Action |
|---------|--------|
| orders/updated, orders/edited | Diff line items; new personalised lines → ingest; removed lines → cancel job, reverse usage |
| orders/cancelled | Cancel queued jobs; mark lines CANCELLED; reverse usage if not yet billed period-closed |
| refunds/create | Reverse usage for refunded personalised lines |

## Integrations (v3, `deliver` job)

- Interface `ProductionProvider { name; sendOrder(order, lines, outputs): Promise<{ externalId }> }`.
- Implement **Custom webhook** first: POST JSON (order, lines, answers, output URLs) signed with HMAC header `X-Personalizer-Signature`.
- Then Printful / Printify / Gelato using their public APIs (VERIFY each API's file and order endpoints and product mapping; mapping UI: our product/variant → provider product/variant).

## Admin order block (v2)

Admin UI extension on the order details page: thumbnails per personalised line + download buttons, status, "Open in Personalizer".

## Tasks

1. Webhook route + `ingest-order` job, idempotent.
2. Render job: preview + print_png.
3. Order metafield write + optional note.
4. Retry/failure handling + emails.
5. Order change handling.
6. (v2) print_svg, proof_pdf, thread_sheet, admin order block.
7. (v3) deliver job + custom webhook + one POD provider.

## Acceptance checks

- [ ] 100 test orders → 100 OrderLines DONE, files downloadable, preview matches storefront snapshot.
- [ ] Sending the same webhook twice creates no duplicates.
- [ ] Forged `_design_id` without the right token is ignored and logged.
- [ ] Cancelled order stops pending renders.


---

# Part 09 — API reference

All shapes reference types from `packages/contract` (Part 03). Errors use one shape:

```json
{ "error": { "code": "validation_failed", "message": "Human text", "details": [{ "path": "options.2.maxLength", "message": "Must be ≥ 1" }] } }
```

## A. Storefront API — through the app proxy

Base: `https://<shop>/apps/personalizer/...` → forwarded to `https://<app>/proxy/...` with Shopify's signature query params. Every handler verifies the signature first (template helper, VERIFY name) and reads `shop` from it. Never trust a shop id from the body.

Rate limits (per IP + shop, sliding window): uploads 20/min, designs 60/min, others 120/min. Respond `429` with `Retry-After`.

### POST /uploads
Request
```json
{ "optionId": "opt_photo", "productId": 123, "fileName": "dog.jpg", "mime": "image/jpeg", "bytes": 2483021 }
```
Server checks the option exists in the published config, `mime` in `accept`, `bytes ≤ maxBytes`.
Response 200
```json
{ "uploadId": "upl_...", "putUrl": "https://<storage>/...signed...", "publicUrl": "https://cdn.../uploads/...", "expiresAt": "2026-12-17T00:00:00Z" }
```
After the browser PUTs the file, call:

### POST /uploads/:uploadId/complete
Server HEADs the object, sniffs the real type from the first bytes, reads dimensions with sharp, strips EXIF, rejects (and deletes) if invalid.
Response `{ "uploadId": "...", "width": 3024, "height": 4032, "thumbUrl": "..." }`

### POST /designs
Request
```json
{
  "productId": 123,
  "variantId": 456,
  "optionSetId": "set_...",
  "version": 7,
  "answers": { "opt_name": { "type": "text", "text": "Maya" } },
  "canvas": null,
  "previewPng": "data:image/png;base64,..."   // optional, ≤ 1.5 MB
}
```
Server: loads the version's config, runs `validate()` (reject 422 on errors), recomputes `priceFor()`, stores design and preview.
Response 200
```json
{ "designId": "des_...", "token": "32-char-random", "previewUrl": "https://cdn.../previews/des_....webp", "feeCents": 1250, "feeSig": "hex-hmac" }
```

### GET /designs/:id?token=...
Response `{ "designId", "productId", "variantId", "answers", "canvas", "previewUrl" }` — 404 if token mismatch.

### GET /config/:productId
Fallback when the metafield is missing/oversized. Response = `ProductConfig`. Cache-Control: `public, max-age=300`.

### GET /health
`{ "ok": true, "shop": "x.myshopify.com" }`

## B. Admin API — session-token authenticated (`app/routes/api.*`)

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | /api/sets | `?status=&q=` | `{ items: OptionSetSummary[] }` |
| POST | /api/sets | `{ name, starter?: "necklace"\|"tote"\|"photo"\|"blank" }` | `OptionSet` |
| GET | /api/sets/:id | — | `OptionSet` (with `draft`) |
| PUT | /api/sets/:id/draft | `OptionSetDraft` | `{ savedAt }` |
| POST | /api/sets/:id/validate | — | `{ errors: [] }` |
| POST | /api/sets/:id/publish | — | `{ version, jobId? }` |
| GET | /api/sets/:id/publish-status | — | `{ state: "running"\|"done"\|"failed", done, total }` |
| POST | /api/sets/:id/unpublish | — | `{ ok }` (removes metafields) |
| POST | /api/sets/:id/duplicate | — | `OptionSet` |
| DELETE | /api/sets/:id | — | `{ ok }` (archive if any design references it) |
| GET | /api/sets/:id/conflicts | — | `{ products: [{ gid, title, winningSetId }] }` |
| GET/POST/DELETE | /api/fonts | multipart via presigned flow | `Font[]` / `Font` |
| GET/POST/PUT/DELETE | /api/libraries, /api/libraries/:id/assets | — | library + assets |
| GET/PUT | /api/templates/:id | `TemplateData` | `Template` |
| GET | /api/orders | `?status=&cursor=` | `{ items: OrderLineSummary[], nextCursor }` |
| GET | /api/orders/:lineId | — | `OrderLine` + design + outputs |
| POST | /api/orders/:lineId/rerender | — | `{ jobId }` |
| PUT | /api/orders/:lineId/answers | `Answers` | `{ jobId }` (v3) |
| GET/PUT | /api/settings | `ShopSettings` | `ShopSettings` |
| GET | /api/onboarding | — | `{ embedEnabled, hasSet, hasPublished }` |
| POST | /api/fee-product/repair | — | `{ productGid, variants }` |

## C. Webhooks — `app/routes/webhooks.tsx`

| Topic | Handler |
|-------|---------|
| orders/create | enqueue `ingest-order` (Part 08) |
| orders/updated | enqueue `sync-order` |
| orders/cancelled | enqueue `cancel-order` |
| refunds/create | enqueue `refund-order` |
| products/update | debounce `reassign` per shop (5 min) |
| products/delete | remove `ProductAssignment` rows |
| app/uninstalled | mark `uninstalledAt`, stop jobs, schedule data deletion in 48 h |
| customers/data_request | export designs/uploads linked to the customer's orders → email merchant |
| customers/redact | delete designs/uploads/outputs for listed orders |
| shop/redact | delete all shop data and storage prefix |

All handlers idempotent: key = webhook id header (`X-Shopify-Webhook-Id`, VERIFY), store processed ids for 7 days.

## D. Shopify Admin GraphQL operations used

| Purpose | Operation (VERIFY names/args for the current API version) |
|---------|-------------|
| Write config | `metafieldDefinitionCreate` (once), `metafieldsSet` |
| Bulk publish | `bulkOperationRunMutation` with `metafieldsSet` |
| Resolve assignment | `products(query:)`, `collection { products }` |
| Fee product | `productCreate`, `productVariantsBulkCreate` |
| Files (fonts/clipart in Shopify Files, optional) | `stagedUploadsCreate`, `fileCreate` |
| Order files | `metafieldsSet` on Order; `orderUpdate` (note) |
| Embed status | `theme(role: MAIN)` + `files(filenames: ["config/settings_data.json"])` |
| Billing | `appSubscriptionCreate`, `appUsageRecordCreate`, `currentAppInstallation` |


---

# Part 10 — Billing, security, privacy, App Store

Security and privacy apply from day one. Billing and App Store items are for the public launch (v3).

## Billing (public app only)

Charge only through the Shopify Billing API.

| Plan key | Includes | Price idea (test before launch) |
|----------|----------|------|
| `free` | Dev stores; 1 option set; 20 personalised orders/month | $0 |
| `starter` | Options edition; 100 orders/month | low monthly |
| `growth` | Options edition; 500 orders/month; simple preview | mid monthly |
| `designer` | Templates, multi-view, print files, integrations; unlimited orders | higher monthly + capped usage fee per personalised item |

Implementation:
- `appSubscriptionCreate` with a recurring line item, plus a usage line item with a `cappedAmount` for `designer` (VERIFY input shape).
- Trial: 14 days. Development stores: free (test charges).
- Gate features with `requirePlan(shop, feature)` on the server and hide UI in admin.
- Usage: on each personalised line (Part 08) → `UsageRecord` + `appUsageRecordCreate` (idempotency key = line item id). Reverse via a negative record is not supported → instead skip billing for lines refunded before the nightly billing batch; document the policy.
- Email the merchant at 80% and 100% of order caps; at 100% the widget keeps working for 48 h grace, then shows the form without preview (never block checkout silently).

## Security checklist

- [ ] Verify HMAC on every webhook and app-proxy request.
- [ ] Session tokens for every admin API route; reject cross-shop ids (always scope queries by the session's shop).
- [ ] Presigned upload URLs: PUT only, 10-minute expiry, exact content-type and max size conditions.
- [ ] Sniff file type server-side from bytes; reject mismatches.
- [ ] Shopper SVG uploads: **reject** (only merchants may upload SVG clipart, and those are sanitized with DOMPurify server-side or svgo with script removal).
- [ ] Strip EXIF (location) from shopper photos.
- [ ] Malware scan uploads (ClamAV container) before marking complete — optional for MVP, required for public app.
- [ ] Escape all shopper text everywhere (admin, emails, PDFs). Never use `dangerouslySetInnerHTML` with shopper data.
- [ ] Design access tokens: 32 bytes random, compared in constant time.
- [ ] Fee signatures: HMAC-SHA256 with a per-shop secret.
- [ ] Rate limits on proxy endpoints.
- [ ] Encrypt Shopify access tokens at rest.
- [ ] Least scopes; request new scopes only when a feature needs them.
- [ ] Dependency audit in CI; pin versions.

## Privacy

- Data stored: shopper text, uploads, previews, order line references. No shopper names/emails stored beyond what's in the order reference.
- Retention: unused uploads 30 days; order files per merchant setting (default 365 days) then deleted.
- Mandatory compliance webhooks implemented (Part 09).
- Publish: privacy policy, DPA for merchants, sub-processor list (hosting, storage, email, Sentry).
- Allow the merchant to export and delete all data from Settings.

## App Store / Built for Shopify checklist (VERIFY current requirements before submission)

- [ ] Theme app extension only; uninstall leaves the theme intact.
- [ ] Storefront performance impact measured on Dawn and a Horizon theme (Lighthouse, before vs after) and within Shopify's limits.
- [ ] Embedded admin, Polaris, App Bridge, fast first load.
- [ ] Billing via Shopify; clear pricing page; free trial behaviour documented.
- [ ] Compliance webhooks pass.
- [ ] Original name, icon, screenshots, demo video, demo store, support email, docs site, privacy policy.
- [ ] No references to competitors' names in the listing or UI.
- [ ] Onboarding works without contacting support.

## Tasks

1. Security checklist items for MVP (HMAC, tokens, presigned limits, sniffing, EXIF strip, escaping, rate limits).
2. Retention jobs + data export/delete.
3. (v3) Billing plans, feature gates, usage records, cap emails.
4. (v3) App Store listing assets and submission.


---

# Part 11 — Testing

| Level | Tool | What | When |
|-------|------|------|------|
| Unit | Vitest | contract functions, conditions, pricing, fee splitter, layout | every PR |
| Snapshot | Vitest + Playwright + pixelmatch | layout() browser vs server; rendered PNGs | every PR touching layout/widget/worker |
| Integration | Vitest + test DB + Redis | publish flow, webhooks → render, proxy endpoints | every PR |
| E2E theme matrix | Playwright | storefront flows on real themes | nightly + before release |
| Load | k6 or autocannon | proxy endpoints, render queue | before public launch |

## Theme matrix (dev store, one theme per run)

Free: Dawn, Horizon (Ritual), Horizon (Heritage). Paid (buy dev copies or use partner access): 5 popular themes chosen by install share.

For each theme, run:
1. Add block + embed via theme editor (scripted with Admin API: write `templates/product.json` block and `settings_data.json` embed — VERIFY API allows this on dev stores; else set up manually once).
2. Product with each MVP option type → fill → add to cart → `/cart.js` contains every expected property.
3. Required field empty → add to cart blocked, error visible and focused.
4. Variant change → conditions and preview photo update.
5. Fee product: totals correct; remove product → fee removed on reload; checkout guard blocks orphan fee.
6. Quick add from collection page (if the theme has it).
7. Mobile viewport 360×800 run of steps 2–4.
8. Checkout (test gateway) → order has properties → files rendered within 5 minutes.

## Load targets

- `/apps/personalizer/designs`: p95 < 400 ms at 50 req/s.
- Render queue: 50 orders/minute sustained with `RENDER_CONCURRENCY=4` per worker; scale workers horizontally.

## Beta

1. Your own store (2 weeks).
2. 5–10 friendly stores with different themes and products (4 weeks). Track: setup time, support tickets, render failures, conversion on personalised products.


---

# Part 12 — Roadmap and agent prompts

About 24 weeks to a public launch with 2 developers; each phase ends at a gate you can stop at.

| Phase | Weeks | Delivers | Gate to pass |
|-------|-------|----------|--------------|
| 1 · MVP (Options edition) | 1–8 | Parts 01–05, 06 (simple preview), 07 option A, 08 (preview + PNG) | Your own store: 100% of test orders correct |
| 2 · Designer | 9–16 | Template editor, multi-view, curve text, SVG/PDF outputs, admin order block, edit-from-cart | Print files match preview in snapshot tests; 5 beta stores live |
| 3 · Public app | 17–24 | Billing, integrations, analytics, theme matrix hardening, App Store submission | App Store approval |

## How to run each task with the agent

For every task below, paste the prompt, then attach the spec files it names. Wait for the agent to finish, run the acceptance checks yourself, then move on.

Template:

```text
Task <ID>: <title>
Read: spec/00-README.md, spec/<files>.
Build exactly what the "Tasks" item(s) <list> in those files describe.
Done means: the acceptance checks listed for these items pass, tests are added,
and docs/changelog.md has a short entry. Mark any VERIFY items you resolved in docs/decisions.md.
Do not start other tasks.
```

## Task list

### Phase 1 — MVP

| ID | Title | Spec files | Tasks in file |
|----|-------|------------|---------------|
| T01 | Scaffold app, workspaces, DB, Redis, extension, proxy health, CI | 01 | 1–6 |
| T02 | Prisma schema, models, seed, upload cleanup | 02 | 1–4 |
| T03 | Contract types, zod, validate/visible/price/properties | 03 | 1–3 |
| T04 | Admin: navigation + option sets list | 04 | 1 |
| T05 | Admin: builder (palette, list, settings per type, autosave, undo) | 03, 04 | 2 |
| T06 | Admin: conditions + pricing tabs | 03, 04 | 3 |
| T07 | Admin: publish + assignment + bulk publish | 02, 03, 04, 09 | 4 |
| T08 | Admin: libraries (fonts, clipart, palettes) | 04, 10 | 5 |
| T09 | Widget: block + embed + text option render | 05 | 1 |
| T10 | Widget: all MVP option components | 03, 05 | 2 |
| T11 | Widget: variant tracking + conditions | 05 | 3 |
| T12 | Widget: slots option | 05 | 4 |
| T13 | Proxy: uploads endpoints + widget upload | 05, 09, 10 | 5 |
| T14 | Proxy: designs endpoint; widget form sync + submit guard | 05, 09 | 6 |
| T15 | Layout package: text + slots + measure (browser/server) | 06 | 1–2 |
| T16 | Widget: live preview overlay + PNG export | 06 | 3 |
| T17 | Fee product, splitter, fee add on submit, orphan cleanup | 07 | 1–4 |
| T18 | fee-guard validation function | 07 | 5 |
| T19 | Webhooks + ingest-order + render preview/PNG + order metafield | 08, 09 | 1–3 |
| T20 | Render retries, failure emails, order change handling | 08 | 4–5 |
| T21 | Admin: onboarding + orders + settings | 04 | 6–8 |
| T22 | Security MVP checklist + retention jobs | 10 | 1–2 |
| T23 | Snapshot tests + theme matrix (Dawn, Horizon) | 06, 11 | 5, matrix |
| **Gate 1** | Own store live; 100 test orders correct | — | — |

### Phase 2 — Designer

| ID | Title | Spec files |
|----|-------|------------|
| T24 | Template editor (Fabric.js) in admin | 03, 04 (§5), 06 |
| T25 | Multi-view preview + variant photos + view thumbnails | 06 |
| T26 | Curve text, column/free layouts, image crop | 06 |
| T27 | print_svg, proof_pdf, thread_sheet outputs | 08 |
| T28 | Admin order block extension | 08 |
| T29 | Edit personalization from cart | 05 |
| T30 | Date + hidden option types; multi-language labels | 03, 05 |
| **Gate 2** | Snapshot thresholds met; 5 beta stores live | — |

### Phase 3 — Public app

| ID | Title | Spec files |
|----|-------|------------|
| T31 | Billing plans, gates, usage records, cap emails | 10 |
| T32 | Custom webhook delivery + first POD provider | 08 |
| T33 | Optional Cart Transform pricing mode | 07 |
| T34 | Analytics (personalised vs not, top fonts/icons) | 04 |
| T35 | Theme matrix: 5 paid themes; per-theme overrides | 05, 11 |
| T36 | Load tests and scaling | 11 |
| T37 | Compliance webhooks, data export/delete, privacy docs | 09, 10 |
| T38 | App Store listing + submission | 10 |
| **Gate 3** | App Store approval | — |

## Tips for working with a coding agent

- Keep each session to one task; start a fresh session per task and re-attach `00-README.md`.
- After each task, commit, then run the acceptance checks yourself on the dev store.
- When the agent hits a VERIFY item, let it read current shopify.dev docs and record the answer; Shopify APIs change every quarter.
- Never let the agent edit generated files in `extensions/personalizer-theme/assets/` by hand; they come from the widget build.


---

