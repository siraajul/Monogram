import type { Option, OptionSetDraft, OptionValue } from "@personalizer/contract";
import { emptyDraft } from "@personalizer/contract";

/** Ids of the fonts / clipart library a starter set refers to, created per shop by the caller. */
export interface StarterContext {
  fontIds: { script: string; block: string };
  iconLibraryId: string;
}

export interface Starter {
  key: "name-necklace" | "monogram-tote" | "photo-gift";
  name: string;
  draft: OptionSetDraft;
}

const fontValues = (ctx: StarterContext): OptionValue[] => [
  { id: "font-script", label: "Script", value: "script", fontId: ctx.fontIds.script },
  { id: "font-block", label: "Block", value: "block", fontId: ctx.fontIds.block },
];

export function nameNecklace(ctx: StarterContext): Starter {
  const options: Option[] = [
    {
      id: "name", type: "text", label: "Name", required: true,
      maxLength: 10, allowed: "^[A-Za-z]*$", placeholder: "Maya", bindTo: "name-layer",
    },
    { id: "font", type: "font", label: "Font", required: true, values: fontValues(ctx), display: "pills" },
    {
      id: "metal", type: "swatch", label: "Metal", required: true, display: "grid",
      values: [
        { id: "metal-gold", label: "Gold", value: "gold", hex: "#D4AF37" },
        { id: "metal-silver", label: "Silver", value: "silver", hex: "#C0C0C0" },
        { id: "metal-rose", label: "Rose gold", value: "rose", hex: "#B76E79" },
      ],
    },
    {
      id: "second-name-toggle", type: "checkbox", label: "Add a second name", required: false,
      minSelect: 0, maxSelect: 1,
      values: [{ id: "second-yes", label: "Yes, add a second name", value: "yes", priceAdd: 10 }],
    },
    {
      id: "second-name", type: "text", label: "Second name", required: true,
      maxLength: 10, allowed: "^[A-Za-z]*$",
    },
  ];
  return {
    key: "name-necklace",
    name: "Name necklace",
    draft: {
      ...emptyDraft(),
      options,
      conditions: [
        {
          id: "show-second-name",
          target: { optionId: "second-name" },
          action: "show",
          when: { all: [{ optionId: "second-name-toggle", operator: "equals", value: "second-yes" }] },
        },
      ],
    },
  };
}

const THREAD_COLOURS: Array<[string, string]> = [
  ["Black", "#1A1A1A"], ["White", "#F5F5F5"], ["Red", "#C62828"], ["Pink", "#EC7FA9"],
  ["Orange", "#EF6C00"], ["Yellow", "#F9C22E"], ["Green", "#2E7D32"], ["Teal", "#00897B"],
  ["Blue", "#1565C0"], ["Navy", "#0D2B5C"], ["Purple", "#6A1B9A"], ["Brown", "#6D4C41"],
];

export function monogramTote(ctx: StarterContext): Starter {
  const options: Option[] = [
    { id: "font", type: "font", label: "Font", required: true, values: fontValues(ctx), display: "pills" },
    {
      id: "thread", type: "swatch", label: "Thread colour", required: true, display: "grid",
      values: THREAD_COLOURS.map(([label, hex]) => ({
        id: `thread-${label.toLowerCase()}`, label, value: label.toLowerCase(), hex,
      })),
    },
    {
      id: "placements", type: "slots", label: "Placements", required: true,
      slotCount: 6, minFilled: 1, kinds: ["text", "letter", "icon"],
      text: { maxLength: 8 },
      fontOptionId: "font", colorOptionId: "thread", iconLibraryId: ctx.iconLibraryId,
      bindTo: "slots-layer",
    },
  ];
  return { key: "monogram-tote", name: "Monogram tote", draft: { ...emptyDraft(), options } };
}

export function photoGift(): Starter {
  const options: Option[] = [
    {
      id: "photo", type: "upload", label: "Your photo", required: true,
      accept: ["image/jpeg", "image/png"], maxBytes: 15 * 1024 * 1024, maxFiles: 1, pricePerFile: 5,
    },
    { id: "caption", type: "text", label: "Caption", required: false, maxLength: 30 },
  ];
  return { key: "photo-gift", name: "Photo gift", draft: { ...emptyDraft(), options } };
}

export function allStarters(ctx: StarterContext): Starter[] {
  return [nameNecklace(ctx), monogramTote(ctx), photoGift()];
}
