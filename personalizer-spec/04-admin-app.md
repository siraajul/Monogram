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
