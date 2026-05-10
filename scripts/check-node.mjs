import { readFileSync } from "node:fs";
import { join } from "node:path";

const expected = readFileSync(join(process.cwd(), ".nvmrc"), "utf8").trim();
const actual = process.version;
const actualMajor = actual.split(".")[0].slice(1); // "v24.14.0" → "24"
const expectedMajor = expected.split(".")[0]; // "24" or "24.14.0"

// Support both "24" and "24.14.0" formats in .nvmrc
const matches = actualMajor === expectedMajor || actual.startsWith("v" + expectedMajor);

if (!matches) {
  console.error(
    `\n  ❌ Node version mismatch. Expected: v${expectedMajor}.x, got: ${actual}\n` +
    `     This project requires Node.js ${expected} (see .nvmrc).\n` +
    `     If you use fnm/nvm, run: fnm use || nvm use\n`
  );
  process.exit(1);
}

console.log(`  ✓ Node ${actual} (expected: ${expected})`);
