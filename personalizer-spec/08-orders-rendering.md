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
