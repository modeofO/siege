/**
 * Self-locating paths.
 *
 * The server needs to resolve `.env`, the manifest, and the session directory
 * regardless of who launches it (Claude Code, raw `tsx`, `node` from another
 * directory). All paths are anchored to the project root derived from this
 * file's URL — never `process.cwd()`.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

/** Project root (mcp-server-2/), one level above `src/`. */
export const PROJECT_ROOT = resolve(here, "..");

/** Resolve a path; relative paths are anchored to PROJECT_ROOT. */
export function fromRoot(p: string): string {
  return resolve(PROJECT_ROOT, p);
}

/**
 * Load a .env file from the project root into process.env.
 * Existing process.env values take precedence.
 *
 * Tiny on purpose — handles `KEY=value`, `#` comments, blank lines, and
 * surrounding single/double quotes. No interpolation or multiline values.
 */
export function loadDotenv(): void {
  const path = fromRoot(".env");
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
