#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// Copies manifest_*.json from the repo root into src/manifests/.
// Runs as a predev/prebuild/pretest hook — Next.js/Turbopack refuses imports
// outside the project root, and sozo migrate writes manifests at the workspace
// root. src/manifests/ is gitignored: these copies are build artifacts.
//
// Every source manifest is committed at the repo root, and contractAddresses.ts
// /dojoConfig.ts import all four statically regardless of NEXT_PUBLIC_NETWORK —
// so a missing source is a broken checkout, not a fresh clone. Fail here with
// the cause rather than letting the build die later at an unresolved import.
// (On Vercel the root is outside the `frontend/` Root Directory, so this also
// catches "Include source files outside of the Root Directory" being turned off.)

const fs = require("node:fs");
const path = require("node:path");

const srcDir = path.resolve(__dirname, "..", "..");
const dstDir = path.resolve(__dirname, "..", "src", "manifests");
const names = ["manifest_dev.json", "manifest_sepolia.json", "manifest_katana.json", "manifest_mainnet.json"];

fs.mkdirSync(dstDir, { recursive: true });

const missing = names.filter((name) => !fs.existsSync(path.join(srcDir, name)));
if (missing.length > 0) {
  console.error(
    `[copy-manifests] missing at repo root (${srcDir}):\n` +
      missing.map((name) => `  - ${name}`).join("\n") +
      "\n\nEvery manifest_*.json is committed at the repo root. If this fired on Vercel,\n" +
      "check that the project has 'Include source files outside of the Root Directory'\n" +
      "enabled — the Root Directory is frontend/, so the repo root is otherwise absent.",
  );
  process.exit(1);
}

for (const name of names) {
  fs.copyFileSync(path.join(srcDir, name), path.join(dstDir, name));
}
