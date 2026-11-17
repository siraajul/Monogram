import type { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { allStarters } from "./starterSets";

const DEMO_ICONS: Array<[string, string]> = [
  ["Star", "M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z"],
  ["Heart", "M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z"],
  ["Circle", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"],
  ["Square", "M4 4h16v16H4z"],
  ["Triangle", "M12 3l10 18H2z"],
  ["Diamond", "M12 2l9 10-9 10-9-10z"],
  ["Moon", "M20 14.5A8.5 8.5 0 0 1 9.5 4 9 9 0 1 0 20 14.5z"],
  ["Plus", "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"],
  ["Bolt", "M13 2L4 14h6l-1 8 9-12h-6z"],
  ["Drop", "M12 2s7 7.5 7 13a7 7 0 0 1-14 0c0-5.5 7-13 7-13z"],
  ["Leaf", "M20 4C9 4 4 9 4 17c0 1 .1 2 .3 3 1 .2 2 .3 3 .3C15 20.3 20 15 20 4z"],
  ["Flag", "M5 3h2v18H5zM8 4h11l-3 4.5 3 4.5H8z"],
];

const svgDataUri = (path: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#222" d="${path}"/></svg>`,
  )}`;

/**
 * Dev-only seed. Idempotent: running it twice leaves one shop, two fonts,
 * one icon library (12 icons) and the three starter option sets.
 * Font URLs are placeholders; real font upload comes with T08.
 */
export async function seedDevData(domain = "dev-store.myshopify.com") {
  const shop = await prisma.shop.upsert({ where: { domain }, create: { domain }, update: {} });

  const font = async (family: string) =>
    (await prisma.font.findFirst({ where: { shopId: shop.id, family } })) ??
    prisma.font.create({
      data: {
        shopId: shop.id,
        family,
        woff2Url: `https://example.com/demo-fonts/${encodeURIComponent(family)}.woff2`,
        sourceUrl: `https://example.com/demo-fonts/${encodeURIComponent(family)}.ttf`,
        licenseNote: "Demo placeholder, replace with a licensed font.",
      },
    });
  const [script, block] = [await font("Demo Script"), await font("Demo Block")];

  let library = await prisma.assetLibrary.findFirst({
    where: { shopId: shop.id, name: "Demo icons", type: "CLIPART" },
  });
  if (!library) {
    library = await prisma.assetLibrary.create({
      data: {
        shopId: shop.id,
        name: "Demo icons",
        type: "CLIPART",
        assets: {
          create: DEMO_ICONS.map(([name, path], position) => ({
            name,
            url: svgDataUri(path),
            tags: [name.toLowerCase()],
            position,
          })),
        },
      },
    });
  }

  const starters = allStarters({
    fontIds: { script: script.id, block: block.id },
    iconLibraryId: library.id,
  });
  for (const starter of starters) {
    const exists = await prisma.optionSet.findFirst({ where: { shopId: shop.id, name: starter.name } });
    if (exists) continue;
    await prisma.optionSet.create({
      data: {
        shopId: shop.id,
        name: starter.name,
        draft: starter.draft as Prisma.InputJsonValue,
      },
    });
  }
  return shop;
}
