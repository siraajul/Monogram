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
