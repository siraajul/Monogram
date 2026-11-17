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
