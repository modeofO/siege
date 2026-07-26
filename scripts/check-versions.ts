/**
 * Toolchain / dependency version audit.
 *
 * Reads every version this repo pins — npm manifests, the Cairo toolchain in
 * Scarb.toml, the binary installs baked into Dockerfile.build, and the
 * container images the Railway infra services run — and compares each against
 * its upstream registry.
 *
 * It never edits anything and always exits 0 (unless --strict). Half the pins
 * here are load-bearing in ways a bumper bot cannot see: the katana binary
 * lives *inside* the dojo image rather than being named by the tag, sozo is a
 * curl of a release tarball, and a torii bump can require a reindex with a
 * fresh --db-dir. Those need the deploy runbooks, so this reports and stops.
 *
 * It reports bump SIZE, not blast radius — semver lies here (torii 1.8.3 ->
 * 1.8.4 was a "patch" that changed KeysClause from vacuous-match to actually
 * filtering). Each row therefore carries a release-notes URL, and the
 * version-check workflow hands the majors and infra pins to an agent that
 * greps this repo for the surface that changed.
 *
 * Usage:
 *   bun x tsx scripts/check-versions.ts              # console report
 *   bun x tsx scripts/check-versions.ts --markdown   # GitHub issue body
 *   bun x tsx scripts/check-versions.ts --json       # machine-readable
 *   bun x tsx scripts/check-versions.ts --strict     # exit 1 if anything is behind
 *
 *   # Mark rows whose upstream version moved since a previous --json run, so
 *   # the workflow only spends agent tokens on genuinely new deltas. --json-out
 *   # emits the payload to a file while stdout stays human-readable.
 *   bun x tsx scripts/check-versions.ts --markdown \
 *     --baseline baseline.json --json-out versions.json
 *
 * Set GITHUB_TOKEN to lift the api.github.com anonymous rate limit (60/hr).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// mcp-server/ is the superseded implementation (see CLAUDE.md) and is
// deliberately absent — its drift is not actionable.
const NPM_MANIFESTS = [
  "frontend/package.json",
  "mcp-server-2/package.json",
  "site/package.json",
  "scripts/package.json",
];

type Severity = "major" | "minor" | "patch" | "unpinned" | "current" | "error";

interface Row {
  /** Stable identity across runs — the baseline diff keys on this. */
  key: string;
  group: string;
  name: string;
  current: string;
  latest: string;
  severity: Severity;
  /** Where a human (or an agent) reads what actually changed. */
  notesUrl?: string;
  note?: string;
  /** True when `latest` differs from the baseline run. Set only with --baseline. */
  isNew?: boolean;
}

// ---------------------------------------------------------------- semver bits

interface Semver {
  major: number;
  minor: number;
  patch: number;
  pre: string | null;
}

function parseSemver(raw: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(raw.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ?? null,
  };
}

function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // A release outranks any prerelease of the same numbers.
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return a.pre < b.pre ? -1 : 1;
}

/** Bump size between a declared version and upstream's latest. */
function classify(currentRaw: string, latestRaw: string): Severity {
  const current = parseSemver(currentRaw);
  const latest = parseSemver(latestRaw);
  if (!current || !latest) return "error";
  if (compareSemver(current, latest) >= 0) return "current";
  if (current.major !== latest.major) return "major";
  if (current.minor !== latest.minor) return "minor";
  return "patch";
}

/** Strip a range operator to the version it is anchored on. */
function baseVersion(range: string): string | null {
  const cleaned = range.trim().replace(/^(\^|~|>=|>|<=|<|=|v)+/, "");
  return parseSemver(cleaned) ? cleaned : null;
}

// -------------------------------------------------------------- registries

const gh = async (path: string): Promise<any> => {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "siege-check-versions",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res.json();
};

/** Normalise the many shapes of package.json `repository` into `owner/repo`. */
function githubSlug(repository: unknown): string | null {
  const url =
    typeof repository === "string"
      ? repository
      : typeof repository === "object" && repository !== null
        ? (repository as { url?: string }).url
        : undefined;
  if (!url) return null;
  const m = /github\.com[/:]([^/]+)\/([^/#.]+)/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

async function npmLatest(pkg: string): Promise<{ version: string; slug: string | null }> {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`);
  if (!res.ok) throw new Error(`npm ${res.status} for ${pkg}`);
  const body = (await res.json()) as { version: string; repository?: unknown };
  return { version: body.version, slug: githubSlug(body.repository) };
}

/** Highest stable tag published for a public GHCR image. */
async function ghcrLatest(image: string): Promise<string> {
  const tokenRes = await fetch(
    `https://ghcr.io/token?scope=${encodeURIComponent(`repository:${image}:pull`)}`,
  );
  if (!tokenRes.ok) throw new Error(`ghcr token ${tokenRes.status} for ${image}`);
  const { token } = (await tokenRes.json()) as { token: string };

  const res = await fetch(`https://ghcr.io/v2/${image}/tags/list?n=1000`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`ghcr ${res.status} for ${image}`);
  const { tags } = (await res.json()) as { tags: string[] };

  return highestStable(tags) ?? "unknown";
}

/**
 * Highest stable release tag on a GitHub repo. `prefix` selects one binary out
 * of a monorepo that tags per-component (dojo publishes `sozo/v1.8.7`).
 */
async function ghReleaseLatest(repo: string, prefix = ""): Promise<string> {
  const releases = (await gh(`/repos/${repo}/releases?per_page=100`)) as Array<{
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
  }>;
  const tags = releases
    .filter((r) => !r.draft && !r.prerelease)
    .map((r) => r.tag_name)
    .filter((t) => (prefix ? t.startsWith(prefix) : !t.includes("/")))
    .map((t) => t.slice(prefix.length));
  return highestStable(tags) ?? "unknown";
}

function highestStable(tags: string[]): string | null {
  let best: { raw: string; sv: Semver } | null = null;
  for (const tag of tags) {
    const sv = parseSemver(tag);
    if (!sv || sv.pre) continue;
    if (!best || compareSemver(sv, best.sv) > 0) best = { raw: tag, sv };
  }
  return best?.raw ?? null;
}

// ------------------------------------------------------------ pinned sources

const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

/** Pull one pinned version out of a file so the report can never drift from it. */
function extract(path: string, pattern: RegExp): string {
  const m = pattern.exec(read(path));
  if (!m) throw new Error(`no match for ${pattern} in ${path}`);
  return m[1];
}

interface PinnedSpec {
  id: string;
  name: string;
  read: () => string;
  latest: () => Promise<string>;
  notesUrl: string;
  note: string;
}

const PINNED: PinnedSpec[] = [
  {
    id: "scarb-dockerfile",
    name: "scarb (Dockerfile.build)",
    read: () => extract("Dockerfile.build", /^ARG SCARB_VERSION=([\d.]+)/m),
    latest: () => ghReleaseLatest("software-mansion/scarb"),
    notesUrl: "https://github.com/software-mansion/scarb/releases",
    note: "Must stay compatible with the dojo cairo crate; bump with cairo-version in Scarb.toml. Verify with the cairo-canary workflow before committing.",
  },
  {
    id: "cairo-version",
    name: "cairo-version (Scarb.toml)",
    read: () => extract("Scarb.toml", /cairo-version = "([\d.]+)"/),
    latest: () => ghReleaseLatest("software-mansion/scarb"),
    notesUrl: "https://github.com/software-mansion/scarb/releases",
    note: "Tracks the scarb release; dojo pins which cairo it compiles against.",
  },
  {
    id: "sozo",
    name: "sozo (Dockerfile.build)",
    read: () => extract("Dockerfile.build", /^ARG SOZO_VERSION=([\d.]+)/m),
    latest: () => ghReleaseLatest("dojoengine/dojo", "sozo/"),
    notesUrl: "https://github.com/dojoengine/dojo/releases",
    note: "Rebuild the builder image after bumping: docker compose build builder. Verify with the cairo-canary workflow.",
  },
  {
    id: "dojo-cairo",
    name: "dojo cairo crate (Scarb.toml)",
    read: () => extract("Scarb.toml", /dojoengine\/dojo\.git", tag = "v([\d.]+)"/),
    latest: () => ghReleaseLatest("dojoengine/dojo"),
    notesUrl: "https://github.com/dojoengine/dojo/releases",
    note: "World ABI surface. A bump means a full re-migrate on every network.",
  },
  {
    id: "oz-cairo",
    name: "openzeppelin cairo-contracts (Scarb.toml)",
    read: () => extract("Scarb.toml", /cairo-contracts\.git", tag = "v([\d.]+)"/),
    latest: () => ghReleaseLatest("OpenZeppelin/cairo-contracts"),
    notesUrl: "https://github.com/OpenZeppelin/cairo-contracts/releases",
    note: "Backs AbilityToken / ResourceToken; a bump redeploys both.",
  },
  {
    id: "torii-mainnet",
    name: "torii image — mainnet",
    read: () => extract("infra/torii-mainnet/Dockerfile", /torii:v([\d.]+)/),
    latest: () => ghcrLatest("dojoengine/torii"),
    notesUrl: "https://github.com/dojoengine/torii/releases",
    note: "Query semantics have changed across minors (KeysClause 1.8.3 -> 1.8.4). Check frontend/CLAUDE.md 'Reads' before bumping.",
  },
  {
    id: "torii-katana",
    name: "torii image — katana",
    read: () => extract("infra/torii-katana/Dockerfile", /torii:v([\d.]+)/),
    latest: () => ghcrLatest("dojoengine/torii"),
    notesUrl: "https://github.com/dojoengine/torii/releases",
    note: "Keep in lockstep with the mainnet torii so the two networks answer queries identically.",
  },
  {
    id: "torii-sepolia",
    name: "torii image — sepolia (parked)",
    read: () => extract("infra/torii/Dockerfile", /installs\/torii\/([\d.]+)\/bin/),
    latest: () => ghcrLatest("dojoengine/torii"),
    notesUrl: "https://github.com/dojoengine/torii/releases",
    note: "Sepolia is parked on the sponsorship outage. Still on the bundled dojo image; migrate to ghcr.io/dojoengine/torii if revived.",
  },
  {
    id: "katana",
    name: "katana binary (infra/katana)",
    read: () => extract("infra/katana/Dockerfile", /installs\/katana\/([\d.]+)\/bin/),
    latest: () => ghcrLatest("dojoengine/katana"),
    notesUrl: "https://github.com/dojoengine/katana/releases",
    note: "Runs from inside ghcr.io/dojoengine/dojo — the FROM tag does NOT name this version. Katana has no state backfill; a bump wipes the dev chain unless the db migrates.",
  },
];

// ---------------------------------------------------------------- collection

interface DeclaredDep {
  manifest: string;
  pkg: string;
  range: string;
}

function readNpmDeps(): DeclaredDep[] {
  const out: DeclaredDep[] = [];
  for (const manifest of NPM_MANIFESTS) {
    const json = JSON.parse(read(manifest)) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const block of [json.dependencies, json.devDependencies]) {
      for (const [pkg, range] of Object.entries(block ?? {})) {
        out.push({ manifest, pkg, range });
      }
    }
  }
  return out;
}

async function checkNpm(deps: DeclaredDep[]): Promise<Row[]> {
  const unique = [...new Set(deps.map((d) => d.pkg))];
  const latest = new Map<string, { version: string; slug: string | null } | string>();

  // Serial batches keep the registry happy without needing a dependency.
  const BATCH = 12;
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (pkg) => {
        try {
          return [pkg, await npmLatest(pkg)] as const;
        } catch (err) {
          return [pkg, `error: ${(err as Error).message}`] as const;
        }
      }),
    );
    for (const [pkg, value] of results) latest.set(pkg, value);
  }

  return deps.map(({ manifest, pkg, range }): Row => {
    const key = `npm:${manifest}:${pkg}`;
    const upstream = latest.get(pkg);

    if (typeof upstream !== "object") {
      return {
        key,
        group: manifest,
        name: pkg,
        current: range,
        latest: "?",
        severity: "error",
        note: typeof upstream === "string" ? upstream : "no registry response",
      };
    }

    const notesUrl = upstream.slug
      ? `https://github.com/${upstream.slug}/releases`
      : `https://www.npmjs.com/package/${pkg}?activeTab=versions`;
    const base = baseVersion(range);

    if (!base) {
      return {
        key,
        group: manifest,
        name: pkg,
        current: range,
        latest: upstream.version,
        severity: "unpinned",
        notesUrl,
        note: "no resolvable version in the range — floating",
      };
    }
    return {
      key,
      group: manifest,
      name: pkg,
      current: range,
      latest: upstream.version,
      severity: classify(base, upstream.version),
      notesUrl,
    };
  });
}

async function checkPinned(): Promise<Row[]> {
  return Promise.all(
    PINNED.map(async (spec): Promise<Row> => {
      let current = "?";
      try {
        current = spec.read();
        const latest = await spec.latest();
        return {
          key: `pinned:${spec.id}`,
          group: "pinned-infra",
          name: spec.name,
          current,
          latest,
          severity: classify(current, latest),
          notesUrl: spec.notesUrl,
          note: spec.note,
        };
      } catch (err) {
        return {
          key: `pinned:${spec.id}`,
          group: "pinned-infra",
          name: spec.name,
          current,
          latest: "?",
          severity: "error",
          notesUrl: spec.notesUrl,
          note: (err as Error).message,
        };
      }
    }),
  );
}

/**
 * Same package, different versions across manifests. This catches problems the
 * registry check never will — e.g. @cartridge/controller drifting between the
 * frontend and the MCP server, which then sign sessions against different
 * policy encodings.
 */
function findDrift(deps: DeclaredDep[]): Array<{ pkg: string; sites: string[] }> {
  const byPkg = new Map<string, Map<string, string[]>>();
  for (const { manifest, pkg, range } of deps) {
    const versions = byPkg.get(pkg) ?? new Map<string, string[]>();
    const manifests = versions.get(range) ?? [];
    manifests.push(manifest);
    versions.set(range, manifests);
    byPkg.set(pkg, versions);
  }

  const drift: Array<{ pkg: string; sites: string[] }> = [];
  for (const [pkg, versions] of byPkg) {
    if (versions.size < 2) continue;
    drift.push({
      pkg,
      sites: [...versions].map(([range, manifests]) => `${range} (${manifests.join(", ")})`),
    });
  }
  return drift.sort((a, b) => a.pkg.localeCompare(b.pkg));
}

/**
 * Flag rows whose upstream version moved since the baseline run. A row missing
 * from the baseline counts as new, so a first run (or a newly added pin) is
 * reported rather than silently skipped.
 */
function applyBaseline(rows: Row[], baselinePath: string): void {
  let baseline: Record<string, string> = {};
  try {
    baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch {
    // No usable baseline — treat everything as new.
  }
  for (const row of rows) {
    row.isNew = row.severity !== "current" && baseline[row.key] !== row.latest;
  }
}

// -------------------------------------------------------------------- output

const RANK: Record<Severity, number> = {
  error: 0,
  major: 1,
  minor: 2,
  patch: 3,
  unpinned: 4,
  current: 5,
};

const LABEL: Record<Severity, string> = {
  error: "ERR  ",
  major: "MAJOR",
  minor: "minor",
  patch: "patch",
  unpinned: "float",
  current: "ok   ",
};

function behind(rows: Row[]): Row[] {
  return rows
    .filter((r) => r.severity !== "current")
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.name.localeCompare(b.name));
}

function renderConsole(pinned: Row[], npm: Row[], drift: ReturnType<typeof findDrift>): string {
  const lines: string[] = [];
  const section = (title: string) =>
    lines.push("", `── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);

  section("pinned toolchain / infra");
  for (const r of pinned.sort((a, b) => RANK[a.severity] - RANK[b.severity])) {
    lines.push(`  ${LABEL[r.severity]}  ${r.name.padEnd(36)} ${r.current} -> ${r.latest}`);
    if (r.severity !== "current" && r.note) lines.push(`         ${r.note}`);
  }

  const npmBehind = behind(npm);
  section(`npm (${npmBehind.length} behind of ${npm.length})`);
  let group = "";
  for (const r of npmBehind.sort(
    (a, b) => a.group.localeCompare(b.group) || RANK[a.severity] - RANK[b.severity],
  )) {
    if (r.group !== group) {
      group = r.group;
      lines.push(`  ${group}`);
    }
    lines.push(`    ${LABEL[r.severity]}  ${r.name.padEnd(34)} ${r.current} -> ${r.latest}`);
  }
  if (npmBehind.length === 0) lines.push("  all current");

  section(`cross-manifest drift (${drift.length})`);
  for (const d of drift) lines.push(`  ${d.pkg}: ${d.sites.join("  vs  ")}`);
  if (drift.length === 0) lines.push("  none");

  return lines.join("\n");
}

function renderMarkdown(
  pinned: Row[],
  npm: Row[],
  drift: ReturnType<typeof findDrift>,
  generatedAt: string,
): string {
  const out: string[] = [];
  const link = (r: Row) => (r.notesUrl ? `[${r.name}](${r.notesUrl})` : r.name);
  const table = (rows: Row[], header: string) => {
    out.push(`| ${header} | Pinned | Latest | Bump |`, "| --- | --- | --- | --- |");
    for (const r of rows) {
      out.push(`| ${link(r)} | \`${r.current}\` | \`${r.latest}\` | ${r.severity} |`);
    }
  };

  out.push(
    "Automated by `scripts/check-versions.ts`. Nothing here is applied — this is a read-only audit.",
    "",
    "Bump size is semver arithmetic, **not** blast radius. See the blast-radius section (if present) for what this repo actually touches.",
  );

  out.push("", "## Pinned toolchain / infra", "");
  out.push(
    "Pinned exactly, with deploy runbooks attached. Do not bump without reading the note.",
    "",
  );
  const pinnedBehind = behind(pinned);
  if (pinnedBehind.length === 0) {
    out.push("All current.");
  } else {
    table(pinnedBehind, "Component");
    out.push("");
    for (const r of pinnedBehind) out.push(`- **${r.name}** — ${r.note ?? ""}`);
  }

  out.push("", "## npm", "");
  const npmBehind = behind(npm);
  if (npmBehind.length === 0) {
    out.push("All current.");
  } else {
    const groups = [...new Set(npmBehind.map((r) => r.group))].sort();
    for (const g of groups) {
      const rows = npmBehind
        .filter((r) => r.group === g)
        .sort((a, b) => RANK[a.severity] - RANK[b.severity]);
      const majors = rows.filter((r) => r.severity === "major").length;
      out.push(
        `<details${majors > 0 ? " open" : ""}><summary><code>${g}</code> — ${rows.length} behind${majors > 0 ? `, ${majors} major` : ""}</summary>`,
        "",
      );
      table(rows, "Package");
      out.push("", "</details>", "");
    }
  }

  out.push("", "## Cross-manifest drift", "");
  if (drift.length === 0) {
    out.push("None — every shared package is on the same range everywhere.");
  } else {
    out.push("| Package | Versions |", "| --- | --- |");
    for (const d of drift) out.push(`| ${d.pkg} | ${d.sites.join("<br>")} |`);
  }

  out.push("", "---", `<sub>Generated ${generatedAt}</sub>`);
  return out.join("\n");
}

// ---------------------------------------------------------------------- main

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const asMarkdown = args.includes("--markdown");
  const strict = args.includes("--strict");
  const baselinePath = flagValue(args, "--baseline");

  const deps = readNpmDeps();
  const [pinned, npm] = await Promise.all([checkPinned(), checkNpm(deps)]);
  const drift = findDrift(deps);
  const generatedAt = new Date().toISOString();

  if (baselinePath) applyBaseline([...pinned, ...npm], baselinePath);

  const all = [...pinned, ...npm];
  const payload = () =>
    JSON.stringify(
      {
        generatedAt,
        rows: all,
        drift,
        // Feed straight back in as the next run's --baseline.
        baseline: Object.fromEntries(all.map((r) => [r.key, r.latest])),
      },
      null,
      2,
    ) + "\n";

  // Lets one run produce both the human report and the machine payload — the
  // workflow needs both and a second run would double the registry traffic.
  const jsonOut = flagValue(args, "--json-out");
  if (jsonOut) writeFileSync(jsonOut, payload());

  if (asJson) {
    process.stdout.write(payload());
  } else if (asMarkdown) {
    process.stdout.write(renderMarkdown(pinned, npm, drift, generatedAt) + "\n");
  } else {
    process.stdout.write(renderConsole(pinned, npm, drift) + "\n");
  }

  if (strict && all.some((r) => r.severity !== "current")) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
