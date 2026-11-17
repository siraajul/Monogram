// Fails if the built widget JS exceeds 60 KB gzipped (spec: 00-README standing rules).
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

const file = "extensions/personalizer-theme/assets/personalizer.js";
const LIMIT = 60 * 1024;
if (!existsSync(file)) {
  console.error(`Missing ${file}. Run: npm run build:widget`);
  process.exit(1);
}
const size = gzipSync(readFileSync(file)).length;
console.log(`personalizer.js: ${(size / 1024).toFixed(1)} KB gzipped (limit ${LIMIT / 1024} KB)`);
if (size > LIMIT) process.exit(1);
