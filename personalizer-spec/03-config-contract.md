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
