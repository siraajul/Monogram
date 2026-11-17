// No imports on purpose: keeps this file free of zod so the storefront bundle stays small.

/** Names of the line-item properties written by toLineProperties (Part 03 table). */
export const LINE_PROPERTY = {
  designId: "_design_id",
  designToken: "_design_token",
  preview: "_preview",
  set: "_set",
  group: "_group",
} as const;
