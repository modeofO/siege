#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
// Copies manifest_*.json from the repo root into src/manifests/.
// Runs as a predev/prebuild hook — Next.js/Turbopack refuses imports outside the
// project root, and sozo migrate writes manifests at the workspace root.
// Missing manifests warn (not fail) so a fresh clone can start before the first migrate.

const fs = require("node:fs");
const path = require("node:path");

const srcDir = path.resolve(__dirname, "..", "..");
const dstDir = path.resolve(__dirname, "..", "src", "manifests");
const names = ["manifest_dev.json", "manifest_sepolia.json"];

fs.mkdirSync(dstDir, { recursive: true });

for (const name of names) {
  const from = path.join(srcDir, name);
  const to = path.join(dstDir, name);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-manifests] missing ${name} at repo root — skipping`);
    continue;
  }
  fs.copyFileSync(from, to);
}
