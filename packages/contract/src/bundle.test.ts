import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

// The storefront widget imports the four functions from this same package (Part 03: "server and widget
// import the same build"). The storefront budget is 60 KB gzipped for the whole widget, so the functions
// must not drag in zod (~90 KB gz). If this fails, a schema module became reachable from a function.
describe("storefront bundle", () => {
  it("bundles the shared functions without zod and stays small", async () => {
    const result = await build({
      stdin: {
        contents: `
          import { validate, priceFor, toLineProperties, visibleOptions } from "./index";
          globalThis.pz = { validate, priceFor, toLineProperties, visibleOptions };`,
        resolveDir: here,
        loader: "ts",
      },
      bundle: true, minify: true, write: false, format: "iife", target: ["es2020"],
    });
    const js = result.outputFiles[0].text;
    expect(js).not.toMatch(/zod/i);
    expect(gzipSync(js).length).toBeLessThan(8 * 1024);
  });
});
