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
