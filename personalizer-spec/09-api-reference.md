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
