> **Historical note:** This dated design or implementation record is archived. It may not match the current code. For current behavior, read `README.md`, `CLAUDE.md`, and the implementation files directly.

# Player Documentation Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Vocs documentation site at `site/` that covers the currently-live 1v1 game mode, themed to match the frontend.

**Architecture:** Vocs (Vite + React + MDX) as a new subproject in `site/`, fully independent of `frontend/`. Theme ported from `frontend/src/app/globals.css` via an auto-loaded `docs/styles.css`. React components (`AbilityCard`, `ModifierCard`) render from typed data files so ability/modifier info has a single source of truth. MDX pages for Getting Started, Rules, Mechanics, and Glossary.

**Tech Stack:** Vocs, React 19, TypeScript, Vite, Vitest + React Testing Library for component tests, Cinzel (Google Fonts) for display type.

**Working directory:** This plan runs inside the `siege-docs` worktree on the `worktree-siege-docs` branch. All paths below are relative to `/Users/modeofo/Apps/siege/.claude/worktrees/siege-docs/`.

**Source spec:** `docs/superpowers/specs/2026-04-10-player-docs-site-design.md` — read first if anything here is unclear.

---

## File structure

### New files this plan creates

```
site/
├── docs/
│   ├── pages/
│   │   ├── index.mdx                       # landing
│   │   ├── getting-started/
│   │   │   ├── welcome.mdx
│   │   │   ├── connect-wallet.mdx
│   │   │   └── first-match.mdx
│   │   ├── rules/
│   │   │   ├── goal.mdx
│   │   │   ├── round-loop.mdx
│   │   │   ├── budget.mdx
│   │   │   ├── commit-reveal.mdx
│   │   │   └── scoring.mdx
│   │   ├── mechanics/
│   │   │   ├── gates.mdx
│   │   │   ├── modifiers.mdx
│   │   │   ├── nodes.mdx
│   │   │   ├── traps.mdx
│   │   │   ├── vault.mdx
│   │   │   ├── resources.mdx
│   │   │   └── abilities.mdx
│   │   └── glossary.mdx
│   ├── public/
│   │   ├── desk_preview.png                # copied from frontend/public/sprites/
│   │   └── sprites/abilities/              # 5 SVGs copied from frontend
│   │       ├── siege-sword.svg
│   │       ├── stone-cloak.svg
│   │       ├── ember-blast.svg
│   │       ├── hex.svg
│   │       └── fortify.svg
│   └── styles.css                          # theme port, auto-loaded by Vocs
├── src/
│   ├── components/
│   │   ├── AbilityCard.tsx
│   │   ├── AbilityCard.test.tsx
│   │   ├── ModifierCard.tsx
│   │   └── ModifierCard.test.tsx
│   ├── data/
│   │   ├── abilities.ts
│   │   ├── abilities.test.ts
│   │   ├── modifiers.ts
│   │   ├── modifiers.test.ts
│   │   ├── resources.ts
│   │   └── resources.test.ts
│   └── test-setup.ts                       # vitest DOM setup
├── vocs.config.ts
├── tsconfig.json
├── vitest.config.ts
├── package.json
└── .gitignore
```

**Nothing in `frontend/`, `src/`, `scripts/`, or any existing file is modified.** This is a pure additive subproject.

---

## Task 1: Scaffold the Vocs project

**Files:**
- Create: `site/` directory and initial Vocs project files

- [ ] **Step 1: Verify `site/` does not already exist**

Run: `ls site/ 2>/dev/null && echo "EXISTS" || echo "CLEAN"`
Expected output: `CLEAN`

If `EXISTS` is printed, stop and investigate — do not overwrite.

- [ ] **Step 2: Run the Vocs scaffold CLI**

The `npm create vocs` CLI is interactive. Answer the prompts as follows:
- **Project name / directory**: `site`
- **Any other prompts**: accept defaults

Run: `npm create vocs@latest -- site`

If the CLI does not accept `site` as a positional argument (varies by version), run `npm create vocs@latest` and type `site` at the "project name" prompt.

After it finishes, you should see `site/` with at least: `site/package.json`, `site/vocs.config.ts`, `site/docs/pages/index.mdx`.

- [ ] **Step 3: Trim the default scaffold**

The scaffold creates sample pages alongside `index.mdx`. Remove any sample pages so our sidebar (wired in Task 11) starts from a clean slate. Keep `site/docs/pages/index.mdx` — we'll overwrite it in Task 11 and again in Task 17.

Run:
```bash
find site/docs/pages -mindepth 1 -type f -not -name 'index.mdx' -delete
find site/docs/pages -mindepth 1 -type d -empty -delete
```

`-mindepth 1` ensures `pages/` itself is never removed. The two commands together delete sample files first, then any now-empty sample directories.

- [ ] **Step 4: Install dependencies**

Run: `cd site && npm install`
Expected: install completes without errors.

- [ ] **Step 5: Verify scaffold dev server boots**

Run: `cd site && npm run dev` (or whatever the scaffolded script is — likely `dev` or `docs:dev`).

Let it boot (~5 seconds), confirm the terminal prints a URL like `http://localhost:5173`, then Ctrl-C to stop.

Expected: no errors in output.

- [ ] **Step 6: Verify scaffold build succeeds**

Run: `cd site && npm run build`
Expected: completes with no errors, creates `site/docs/dist/` directory.

- [ ] **Step 7: Verify .gitignore covers build outputs**

The Vocs scaffold should create `site/.gitignore` automatically. Verify it ignores `node_modules`, `dist`, and `docs/dist`:

Run: `cat site/.gitignore 2>/dev/null`
Expected: contains at least `node_modules` and `dist` (or `docs/dist`).

If the scaffold didn't create a `.gitignore`, create `site/.gitignore` with:
```
node_modules
docs/dist
.vocs
dist
```

- [ ] **Step 8: Commit the scaffold**

Use `git status` to confirm what's being staged — should include `site/package.json`, `site/vocs.config.ts`, `site/docs/pages/index.mdx`, `site/.gitignore`, etc. Should NOT include `site/node_modules/` or `site/docs/dist/`.

```bash
git add site/
git status
git commit -m "feat(site): scaffold Vocs docs subproject"
```

---

## Task 2: Configure TypeScript path alias and baseline config

**Files:**
- Modify: `site/tsconfig.json`
- Modify: `site/vocs.config.ts`

- [ ] **Step 1: Read the scaffolded `site/tsconfig.json`**

Note its current `compilerOptions`. The scaffold typically sets `target`, `module`, `jsx: react-jsx`, etc.

- [ ] **Step 2: Add `@/*` path alias to tsconfig**

Add or merge into `site/tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

Keep the rest of the scaffolded `compilerOptions` unchanged — just add `baseUrl` and `paths`.

- [ ] **Step 3: Update `vocs.config.ts` with title, description, and Vite alias**

Replace the contents of `site/vocs.config.ts` with:

```ts
import { defineConfig } from 'vocs'
import path from 'node:path'

export default defineConfig({
  title: 'Siege',
  description: 'Player guide to Siege — rules, mechanics, and glossary.',
  titleTemplate: '%s · Siege',
  theme: {
    colorScheme: 'dark',
    accentColor: { dark: '#daa520' },
  },
  head() {
    return [
      // Cinzel: display serif matching the game client (frontend loads it via next/font)
      ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
      ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
      ['link', {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap',
      }],
    ]
  },
  vite: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  },
})
```

The sidebar is intentionally omitted for now — we'll wire it up in Task 15 once the pages exist.

- [ ] **Step 4: Verify the config is valid**

Run: `cd site && npm run build`
Expected: completes without errors.

If a dependency like `@types/node` is missing (the `path` import), add it:
`cd site && npm install -D @types/node`

- [ ] **Step 5: Commit**

```bash
git add site/tsconfig.json site/vocs.config.ts site/package.json site/package-lock.json
git commit -m "feat(site): configure title, theme, font, and @/ path alias"
```

---

## Task 3: Set up Vitest + React Testing Library

**Files:**
- Create: `site/vitest.config.ts`
- Create: `site/src/test-setup.ts`
- Modify: `site/package.json` (add test script)

- [ ] **Step 1: Install test dependencies**

Run:
```bash
cd site && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

Expected: install completes with no errors.

- [ ] **Step 2: Create `site/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
})
```

- [ ] **Step 3: Create `site/src/test-setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Add `test` script to `site/package.json`**

Add to the `scripts` object:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Keep existing scripts (`dev`, `build`, `preview`) unchanged.

- [ ] **Step 5: Smoke-test the test runner**

Create a throwaway test to confirm everything is wired up:

File: `site/src/smoke.test.ts`
```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `cd site && npm test`
Expected: `1 passed`.

Delete the smoke test: `rm site/src/smoke.test.ts`

- [ ] **Step 6: Commit**

```bash
git add site/vitest.config.ts site/src/test-setup.ts site/package.json site/package-lock.json
git commit -m "feat(site): set up vitest + @testing-library/react"
```

---

## Task 4: Copy assets from frontend

**Files:**
- Create: `site/docs/public/desk_preview.png`
- Create: `site/docs/public/sprites/abilities/*.svg` (5 files)

- [ ] **Step 1: Create public asset directories**

Run:
```bash
mkdir -p site/docs/public/sprites/abilities
```

- [ ] **Step 2: Copy the desk background**

Run:
```bash
cp frontend/public/sprites/desk_preview.png site/docs/public/desk_preview.png
```

Verify: `ls -la site/docs/public/desk_preview.png`

- [ ] **Step 3: Copy the 5 ability SVGs**

Run:
```bash
cp frontend/public/sprites/abilities/siege-sword.svg site/docs/public/sprites/abilities/
cp frontend/public/sprites/abilities/stone-cloak.svg site/docs/public/sprites/abilities/
cp frontend/public/sprites/abilities/ember-blast.svg site/docs/public/sprites/abilities/
cp frontend/public/sprites/abilities/hex.svg site/docs/public/sprites/abilities/
cp frontend/public/sprites/abilities/fortify.svg site/docs/public/sprites/abilities/
```

Verify: `ls site/docs/public/sprites/abilities/` → 5 files listed.

- [ ] **Step 4: Commit**

```bash
git add site/docs/public/
git commit -m "feat(site): copy desk background and ability sprites from frontend"
```

---

## Task 5: Port theme CSS

**Files:**
- Create: `site/docs/styles.css`

**Source of truth:** `frontend/src/app/globals.css` — palette lines 7-19, body background lines 21-43, `.panel-medieval` lines 102-106. If that file has been refactored, read it first and adapt.

- [ ] **Step 1: Re-read the source globals**

Open `frontend/src/app/globals.css` and verify the palette values, body background rules, and `.panel-medieval` gradient are still there. If the file has changed materially, note the differences — the port below assumes the values in the spec.

- [ ] **Step 2: Create `site/docs/styles.css`**

```css
/*
 * Siege docs theme
 * Port of frontend/src/app/globals.css — dark medieval war-room.
 * Vocs auto-detects and imports this file.
 */

:root.dark {
  /* Vocs built-ins → siege palette */
  --vocs-color_background: #0d0b0a;
  --vocs-color_background2: #1a1714;
  --vocs-color_background3: #252019;
  --vocs-color_border: #3d3428;
  --vocs-color_text: #d4cfc6;
  --vocs-color_text2: #7a7060;
  --vocs-color_textAccent: #daa520;

  /* Typography */
  --vocs-fontFamily_default: 'Cinzel', 'Times New Roman', serif;
  --vocs-fontFamily_mono: 'ui-monospace', 'SFMono-Regular', Menlo, monospace;

  /* Custom siege vars for components */
  --siege-color-accent: #b8860b;
  --siege-color-parchment: #2a2318;
  --siege-color-friendly: #c8a44e;
  --siege-color-enemy: #c44332;
  --siege-color-gold: #daa520;
}

/* Body background: desk image + dim overlay */
body {
  background-color: #0d0b0a;
  background-image: url('/desk_preview.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: fixed;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  background: rgba(13, 11, 10, 0.55);
  pointer-events: none;
  z-index: 0;
}

body > * {
  position: relative;
  z-index: 1;
}

/* Shared panel utility — used by AbilityCard and ModifierCard */
.panel-medieval {
  background: linear-gradient(
    135deg,
    var(--vocs-color_background2) 0%,
    var(--siege-color-parchment) 100%
  );
  border: 1px solid var(--vocs-color_border);
  border-radius: 4px;
  padding: 1rem;
}

/* Heading tweak: slightly more letter-spacing on display headings */
.Vocs_H1, .Vocs_H2 {
  letter-spacing: 0.02em;
}
```

- [ ] **Step 3: Verify build still succeeds**

Run: `cd site && npm run build`
Expected: clean build, no CSS errors.

- [ ] **Step 4: Visual smoke test**

Run: `cd site && npm run dev`
Open `http://localhost:5173` in a browser. Confirm:
- Background is dark with the desk image visible through a slight overlay
- Text is warm cream color
- Default Vocs index page renders in dark mode
- Font looks like a serif (Cinzel)

Ctrl-C to stop the dev server.

If the background image doesn't load, check that `site/docs/public/desk_preview.png` exists (from Task 4).

- [ ] **Step 5: Commit**

```bash
git add site/docs/styles.css
git commit -m "feat(site): port medieval war-room theme from frontend"
```

---

## Task 6: Define abilities data with test

**Files:**
- Create: `site/src/data/abilities.ts`
- Create: `site/src/data/abilities.test.ts`

**Scope update (2026-04-10):** The game now has **10 abilities** live on Sepolia — 5 T1 (IDs 1–5) and 5 T2 (IDs 6–10), each T2 a stronger variant of a T1 type. T2 crafting burns the matching T1. This task covers all 10. Source of truth: `CLAUDE.md` → "Abilities" section.

- [ ] **Step 1: Write the failing test**

File: `site/src/data/abilities.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { ABILITIES, type Ability } from './abilities'

describe('ABILITIES', () => {
  it('contains exactly 10 abilities (5 T1 + 5 T2)', () => {
    expect(ABILITIES).toHaveLength(10)
    expect(ABILITIES.filter(a => a.tier === 1)).toHaveLength(5)
    expect(ABILITIES.filter(a => a.tier === 2)).toHaveLength(5)
  })

  it('has unique IDs matching on-chain token IDs 1..10', () => {
    const ids = ABILITIES.map(a => a.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('has unique URL slugs', () => {
    const slugs = ABILITIES.map(a => a.slug)
    expect(new Set(slugs).size).toBe(ABILITIES.length)
  })

  it('includes all 5 type names at each tier', () => {
    const expected = [
      'Ember Blast', 'Fortify', 'Hex', 'Siege Sword', 'Stone Cloak',
    ]
    const t1 = ABILITIES.filter(a => a.tier === 1).map(a => a.name).sort()
    const t2 = ABILITIES.filter(a => a.tier === 2).map(a => a.name).sort()
    expect(t1).toEqual(expected)
    expect(t2).toEqual(expected)
  })

  it('id ↔ type/tier relationship matches the on-chain helpers', () => {
    // ability_type(id) = ((id - 1) % 5) + 1     → 1..5
    // ability_tier(id) = Math.floor((id - 1) / 5) + 1   → 1 or 2
    for (const a of ABILITIES) {
      expect(((a.id - 1) % 5) + 1).toBe(a.type)
      expect(Math.floor((a.id - 1) / 5) + 1).toBe(a.tier)
    }
  })

  it('T1 never requires burning a T1; T2 always does', () => {
    for (const a of ABILITIES) {
      expect(a.requiresT1).toBe(a.tier === 2)
    }
  })

  it('every ability has non-empty flavor, effect, and at least one cost', () => {
    for (const a of ABILITIES) {
      expect(a.flavor.length).toBeGreaterThan(0)
      expect(a.effect.length).toBeGreaterThan(0)
      expect(a.cost.length).toBeGreaterThan(0)
      for (const c of a.cost) {
        expect(c.amount).toBeGreaterThan(0)
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd site && npm test -- abilities`
Expected: FAIL with "Cannot find module './abilities'" or similar.

- [ ] **Step 3: Implement `site/src/data/abilities.ts`**

```ts
/**
 * Source of truth for abilities.
 * Values come from CLAUDE.md's Abilities table and the on-chain
 * AbilityToken contract (token IDs 1-10, currently live on Sepolia).
 *
 * 10 total abilities: 5 T1 (IDs 1-5) and 5 T2 (IDs 6-10). T2 is a
 * stronger variant of each T1 type; T2 crafting burns 1 of the matching
 * T1 in addition to its resource cost.
 *
 * Helpers matching the Cairo + TS sides:
 *   ability_type(id) = ((id - 1) % 5) + 1   → 1..5
 *   ability_tier(id) = ((id - 1) / 5) + 1   → 1 or 2
 */

export type ResourceToken =
  | 'iron' | 'linen' | 'stone' | 'wood' | 'ember' | 'seeds'

export type ResourceCost = { token: ResourceToken; amount: number }

/**
 * The 5 distinct ability "types". Each type has a T1 and a T2 variant.
 * Type is stable across tiers; tier controls power level + cost.
 */
export type AbilityType = 1 | 2 | 3 | 4 | 5

export type Ability = {
  id: number              // 1..10, matches on-chain token ID
  type: AbilityType       // ((id - 1) % 5) + 1
  slug: string            // URL-safe, unique per ability (e.g. "siege-sword", "siege-sword-t2")
  name: string            // Display name (T1 and T2 share the same name)
  tier: 1 | 2             // Math.floor((id - 1) / 5) + 1
  flavor: string          // one-line lore (tone B)
  effect: string          // plain-English mechanical effect
  cost: ResourceCost[]
  requiresT1: boolean     // true for every T2; crafting burns the matching T1
  iconPath: string        // path under docs/public; T2 reuses T1's SVG
}

export const ABILITIES: Ability[] = [
  // ─── T1 ───────────────────────────────────────────────
  {
    id: 1,
    type: 1,
    slug: 'siege-sword',
    name: 'Siege Sword',
    tier: 1,
    flavor: 'Forged for one purpose: to find the crack in a gate.',
    effect: 'Sets your attack on one chosen gate to 5.',
    cost: [
      { token: 'iron', amount: 3 },
      { token: 'wood', amount: 2 },
    ],
    requiresT1: false,
    iconPath: '/sprites/abilities/siege-sword.svg',
  },
  {
    id: 2,
    type: 2,
    slug: 'stone-cloak',
    name: 'Stone Cloak',
    tier: 1,
    flavor: 'Drape the walls in quarry-dust and weather the day.',
    effect: 'Halves all gate damage taken this round.',
    cost: [
      { token: 'stone', amount: 3 },
      { token: 'linen', amount: 2 },
    ],
    requiresT1: false,
    iconPath: '/sprites/abilities/stone-cloak.svg',
  },
  {
    id: 3,
    type: 3,
    slug: 'ember-blast',
    name: 'Ember Blast',
    tier: 1,
    flavor: 'Coals hurled past the gates, into the vault itself.',
    effect: 'Deals 2 direct damage to the enemy vault, bypassing all gates.',
    cost: [
      { token: 'ember', amount: 3 },
      { token: 'seeds', amount: 2 },
    ],
    requiresT1: false,
    iconPath: '/sprites/abilities/ember-blast.svg',
  },
  {
    id: 4,
    type: 4,
    slug: 'hex',
    name: 'Hex',
    tier: 1,
    flavor: "A quiet curse whispered over the opponent's ledger.",
    effect: "Reduces the opponent's total damage by 3 this round.",
    cost: [
      { token: 'iron', amount: 2 },
      { token: 'stone', amount: 2 },
      { token: 'ember', amount: 1 },
    ],
    requiresT1: false,
    iconPath: '/sprites/abilities/hex.svg',
  },
  {
    id: 5,
    type: 5,
    slug: 'fortify',
    name: 'Fortify',
    tier: 1,
    flavor: 'Brace every beam. Nothing comes through today.',
    effect: 'Grants +1 defense at every gate this round.',
    cost: [
      { token: 'stone', amount: 2 },
      { token: 'linen', amount: 2 },
      { token: 'wood', amount: 1 },
    ],
    requiresT1: false,
    iconPath: '/sprites/abilities/fortify.svg',
  },

  // ─── T2 ───────────────────────────────────────────────
  {
    id: 6,
    type: 1,
    slug: 'siege-sword-t2',
    name: 'Siege Sword',
    tier: 2,
    flavor: 'Twice-tempered steel. When it strikes, the gate has already fallen.',
    effect: 'Sets your attack on one chosen gate to 10.',
    cost: [
      { token: 'iron', amount: 30 },
      { token: 'wood', amount: 20 },
      { token: 'ember', amount: 10 },
    ],
    requiresT1: true,
    iconPath: '/sprites/abilities/siege-sword.svg',
  },
  {
    id: 7,
    type: 2,
    slug: 'stone-cloak-t2',
    name: 'Stone Cloak',
    tier: 2,
    flavor: 'Quarry and thread woven so tight the stones hold their breath.',
    effect: 'Reduces all gate damage taken this round to zero.',
    cost: [
      { token: 'stone', amount: 30 },
      { token: 'linen', amount: 20 },
      { token: 'seeds', amount: 10 },
    ],
    requiresT1: true,
    iconPath: '/sprites/abilities/stone-cloak.svg',
  },
  {
    id: 8,
    type: 3,
    slug: 'ember-blast-t2',
    name: 'Ember Blast',
    tier: 2,
    flavor: 'Not coals this time — a furnace loosed straight at the vault.',
    effect: 'Deals 6 direct damage to the enemy vault, bypassing all gates.',
    cost: [
      { token: 'ember', amount: 30 },
      { token: 'seeds', amount: 20 },
      { token: 'iron', amount: 10 },
    ],
    requiresT1: true,
    iconPath: '/sprites/abilities/ember-blast.svg',
  },
  {
    id: 9,
    type: 4,
    slug: 'hex-t2',
    name: 'Hex',
    tier: 2,
    flavor: 'Written in fire this time. The ledger burns before they can read it.',
    effect: "Reduces the opponent's total damage by 8 this round.",
    cost: [
      { token: 'iron', amount: 20 },
      { token: 'stone', amount: 20 },
      { token: 'ember', amount: 10 },
      { token: 'wood', amount: 10 },
    ],
    requiresT1: true,
    iconPath: '/sprites/abilities/hex.svg',
  },
  {
    id: 10,
    type: 5,
    slug: 'fortify-t2',
    name: 'Fortify',
    tier: 2,
    flavor: 'Every beam doubled. Every stone doubled. A wall behind the wall.',
    effect: 'Doubles all defense values this round.',
    cost: [
      { token: 'stone', amount: 20 },
      { token: 'linen', amount: 20 },
      { token: 'wood', amount: 10 },
    ],
    requiresT1: true,
    iconPath: '/sprites/abilities/fortify.svg',
  },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd site && npm test -- abilities`
Expected: all 7 tests pass.

- [ ] **Step 5: Verify type-check is clean**

Run: `cd site && npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add site/src/data/abilities.ts site/src/data/abilities.test.ts
git commit -m "feat(site): add abilities data (T1 + T2) with integrity tests"
```

---

## Task 7: Define modifiers data with test

**Files:**
- Create: `site/src/data/modifiers.ts`
- Create: `site/src/data/modifiers.test.ts`

- [ ] **Step 1: Write the failing test**

File: `site/src/data/modifiers.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { MODIFIERS } from './modifiers'

describe('MODIFIERS', () => {
  it('contains exactly 5 gate modifiers', () => {
    expect(MODIFIERS).toHaveLength(5)
  })

  it('probabilities sum to 100', () => {
    const total = MODIFIERS.reduce((acc, m) => acc + m.probability, 0)
    expect(total).toBe(100)
  })

  it('includes all 5 named modifiers', () => {
    const names = MODIFIERS.map(m => m.name).sort()
    expect(names).toEqual([
      'Deadlock', 'Mirror Gate', 'Narrow Pass', 'Normal', 'Reflection',
    ])
  })

  it('every modifier has non-empty flavor and effect', () => {
    for (const m of MODIFIERS) {
      expect(m.flavor.length).toBeGreaterThan(0)
      expect(m.effect.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd site && npm test -- modifiers`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `site/src/data/modifiers.ts`**

```ts
/**
 * Source of truth for gate modifiers.
 * Each round, every gate independently rolls one modifier.
 * Probabilities and effects come from CLAUDE.md's "Gate Modifiers" section.
 */

export type Modifier = {
  slug: string
  name: string
  probability: number   // percentage, 0-100
  flavor: string
  effect: string
}

export const MODIFIERS: Modifier[] = [
  {
    slug: 'normal',
    name: 'Normal',
    probability: 60,
    flavor: 'The gate stands as it was built.',
    effect: 'No change. Attack and defense resolve as normal.',
  },
  {
    slug: 'narrow-pass',
    name: 'Narrow Pass',
    probability: 10,
    flavor: 'The way is choked with rubble. Only so many can pass.',
    effect: 'Both attack and defense at this gate are capped at 3.',
  },
  {
    slug: 'mirror-gate',
    name: 'Mirror Gate',
    probability: 10,
    flavor: 'The gate reflects intent. Attackers find themselves defending.',
    effect: 'Attack and defense values swap at this gate.',
  },
  {
    slug: 'deadlock',
    name: 'Deadlock',
    probability: 10,
    flavor: 'Neither side yields an inch.',
    effect: 'No damage is dealt at this gate this round.',
  },
  {
    slug: 'reflection',
    name: 'Reflection',
    probability: 10,
    flavor: 'Every blow echoes to the walls beside it.',
    effect: 'Damage at this gate reflects onto the other gates.',
  },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd site && npm test -- modifiers`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add site/src/data/modifiers.ts site/src/data/modifiers.test.ts
git commit -m "feat(site): add gate modifiers data + integrity tests"
```

---

## Task 8: Define resources data with test

**Files:**
- Create: `site/src/data/resources.ts`
- Create: `site/src/data/resources.test.ts`

- [ ] **Step 1: Write the failing test**

File: `site/src/data/resources.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { RESOURCES, type ResourceToken } from './resources'

describe('RESOURCES', () => {
  const tokens: ResourceToken[] = [
    'iron', 'linen', 'stone', 'wood', 'ember', 'seeds',
  ]

  it('has an entry for every resource token', () => {
    for (const t of tokens) {
      expect(RESOURCES[t]).toBeDefined()
    }
  })

  it('each resource has name, node, pair, and label', () => {
    for (const t of tokens) {
      const r = RESOURCES[t]
      expect(r.name.length).toBeGreaterThan(0)
      expect(['forge', 'quarry', 'grove']).toContain(r.node)
      expect(tokens).toContain(r.pair)
      expect(r.label.length).toBeGreaterThan(0)
    }
  })

  it('each node has exactly two resources that pair with each other', () => {
    const byNode: Record<string, ResourceToken[]> = {}
    for (const t of tokens) {
      const r = RESOURCES[t]
      byNode[r.node] = byNode[r.node] || []
      byNode[r.node].push(t)
    }
    expect(byNode.forge).toHaveLength(2)
    expect(byNode.quarry).toHaveLength(2)
    expect(byNode.grove).toHaveLength(2)

    // Pairs must be mutual
    for (const t of tokens) {
      const r = RESOURCES[t]
      expect(RESOURCES[r.pair].pair).toBe(t)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd site && npm test -- resources`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `site/src/data/resources.ts`**

```ts
/**
 * Source of truth for resource tokens.
 * Each resource node produces a pair of ERC-20 tokens.
 * Values from CLAUDE.md "Resource Tokens" table.
 *
 * No icon sprites currently exist in the repo; the AbilityCard
 * cost row renders resources as text labels. When icons are
 * created later, add iconPath to the Resource type and update
 * AbilityCard.
 */

export type ResourceToken =
  | 'iron' | 'linen' | 'stone' | 'wood' | 'ember' | 'seeds'

export type ResourceNode = 'forge' | 'quarry' | 'grove'

export type Resource = {
  name: string          // Display name, e.g. "Iron"
  label: string         // Short label, e.g. "IRON"
  node: ResourceNode    // Which node produces it
  pair: ResourceToken   // Its sibling token on the same node
}

export const RESOURCES: Record<ResourceToken, Resource> = {
  iron:   { name: 'Iron',   label: 'IRON',   node: 'forge',  pair: 'linen' },
  linen:  { name: 'Linen',  label: 'LINEN',  node: 'forge',  pair: 'iron'  },
  stone:  { name: 'Stone',  label: 'STONE',  node: 'quarry', pair: 'wood'  },
  wood:   { name: 'Wood',   label: 'WOOD',   node: 'quarry', pair: 'stone' },
  ember:  { name: 'Ember',  label: 'EMBER',  node: 'grove',  pair: 'seeds' },
  seeds:  { name: 'Seeds',  label: 'SEEDS',  node: 'grove',  pair: 'ember' },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd site && npm test -- resources`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add site/src/data/resources.ts site/src/data/resources.test.ts
git commit -m "feat(site): add resource tokens data + integrity tests"
```

---

## Task 9: Implement AbilityCard (TDD)

**Files:**
- Create: `site/src/components/AbilityCard.tsx`
- Create: `site/src/components/AbilityCard.test.tsx`

- [ ] **Step 1: Write the failing test**

File: `site/src/components/AbilityCard.test.tsx`

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AbilityCard } from './AbilityCard'
import { ABILITIES } from '@/data/abilities'

describe('AbilityCard', () => {
  const siegeSword = ABILITIES.find(a => a.slug === 'siege-sword')!

  it('renders the ability name', () => {
    render(<AbilityCard ability={siegeSword} />)
    expect(screen.getByText('Siege Sword')).toBeInTheDocument()
  })

  it('renders the ability effect text', () => {
    render(<AbilityCard ability={siegeSword} />)
    expect(screen.getByText(/maximum damage/i)).toBeInTheDocument()
  })

  it('renders the flavor text', () => {
    render(<AbilityCard ability={siegeSword} />)
    expect(screen.getByText(/find the crack/i)).toBeInTheDocument()
  })

  it('renders each cost entry with amount and label', () => {
    render(<AbilityCard ability={siegeSword} />)
    // Siege Sword: 3 iron, 2 wood
    expect(screen.getByText(/3/)).toBeInTheDocument()
    expect(screen.getByText(/iron/i)).toBeInTheDocument()
    expect(screen.getByText(/2/)).toBeInTheDocument()
    expect(screen.getByText(/wood/i)).toBeInTheDocument()
  })

  it('renders the ability icon with alt text', () => {
    render(<AbilityCard ability={siegeSword} />)
    const img = screen.getByRole('img', { name: /siege sword/i })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/sprites/abilities/siege-sword.svg')
  })

  it('renders tier pill', () => {
    render(<AbilityCard ability={siegeSword} />)
    expect(screen.getByText(/T1/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd site && npm test -- AbilityCard`
Expected: FAIL — `AbilityCard` not defined.

- [ ] **Step 3: Implement `site/src/components/AbilityCard.tsx`**

```tsx
import type { Ability } from '@/data/abilities'
import { RESOURCES } from '@/data/resources'

type Props = {
  ability: Ability
}

export function AbilityCard({ ability }: Props) {
  return (
    <div
      className="panel-medieval"
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr',
        gap: '1rem',
        marginBottom: '0.75rem',
      }}
    >
      <img
        src={ability.iconPath}
        alt={ability.name}
        style={{
          width: '72px',
          height: '72px',
          objectFit: 'contain',
          alignSelf: 'start',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <h4 style={{ margin: 0, color: 'var(--vocs-color_textAccent)' }}>
            {ability.name}
          </h4>
          <span
            style={{
              fontSize: '0.7rem',
              padding: '2px 6px',
              borderRadius: '3px',
              border: '1px solid var(--vocs-color_border)',
              color: 'var(--siege-color-friendly)',
              letterSpacing: '0.1em',
            }}
          >
            T{ability.tier}
          </span>
        </div>

        <p
          style={{
            margin: 0,
            fontStyle: 'italic',
            color: 'var(--vocs-color_text2)',
            fontSize: '0.9rem',
          }}
        >
          {ability.flavor}
        </p>

        <p style={{ margin: 0, color: 'var(--vocs-color_text)' }}>
          {ability.effect}
        </p>

        <ul
          style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            listStyle: 'none',
            padding: 0,
            margin: 0,
            fontSize: '0.85rem',
          }}
        >
          {ability.cost.map(c => (
            <li
              key={c.token}
              style={{
                color: 'var(--siege-color-gold)',
                letterSpacing: '0.05em',
              }}
            >
              {c.amount} × {RESOURCES[c.token].label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd site && npm test -- AbilityCard`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add site/src/components/AbilityCard.tsx site/src/components/AbilityCard.test.tsx
git commit -m "feat(site): AbilityCard component with data-driven rendering"
```

---

## Task 10: Implement ModifierCard (TDD)

**Files:**
- Create: `site/src/components/ModifierCard.tsx`
- Create: `site/src/components/ModifierCard.test.tsx`

- [ ] **Step 1: Write the failing test**

File: `site/src/components/ModifierCard.test.tsx`

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModifierCard } from './ModifierCard'
import { MODIFIERS } from '@/data/modifiers'

describe('ModifierCard', () => {
  const narrowPass = MODIFIERS.find(m => m.slug === 'narrow-pass')!

  it('renders the modifier name', () => {
    render(<ModifierCard modifier={narrowPass} />)
    expect(screen.getByText('Narrow Pass')).toBeInTheDocument()
  })

  it('renders the probability as a percentage', () => {
    render(<ModifierCard modifier={narrowPass} />)
    expect(screen.getByText(/10%/)).toBeInTheDocument()
  })

  it('renders the flavor text', () => {
    render(<ModifierCard modifier={narrowPass} />)
    expect(screen.getByText(/choked with rubble/i)).toBeInTheDocument()
  })

  it('renders the effect text', () => {
    render(<ModifierCard modifier={narrowPass} />)
    expect(screen.getByText(/capped at 3/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd site && npm test -- ModifierCard`
Expected: FAIL — `ModifierCard` not defined.

- [ ] **Step 3: Implement `site/src/components/ModifierCard.tsx`**

```tsx
import type { Modifier } from '@/data/modifiers'

type Props = {
  modifier: Modifier
}

export function ModifierCard({ modifier }: Props) {
  return (
    <div
      className="panel-medieval"
      style={{
        marginBottom: '0.75rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        <h4 style={{ margin: 0, color: 'var(--vocs-color_textAccent)' }}>
          {modifier.name}
        </h4>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '2px 8px',
            borderRadius: '3px',
            border: '1px solid var(--vocs-color_border)',
            color: 'var(--siege-color-friendly)',
            letterSpacing: '0.05em',
          }}
        >
          {modifier.probability}%
        </span>
      </div>

      <p
        style={{
          margin: '0 0 0.5rem 0',
          fontStyle: 'italic',
          color: 'var(--vocs-color_text2)',
          fontSize: '0.9rem',
        }}
      >
        {modifier.flavor}
      </p>

      <p style={{ margin: 0, color: 'var(--vocs-color_text)' }}>
        {modifier.effect}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd site && npm test -- ModifierCard`
Expected: 4 tests pass.

- [ ] **Step 5: Run all tests to verify nothing regressed**

Run: `cd site && npm test`
Expected: all tests across abilities, modifiers, resources, AbilityCard, ModifierCard pass.

- [ ] **Step 6: Commit**

```bash
git add site/src/components/ModifierCard.tsx site/src/components/ModifierCard.test.tsx
git commit -m "feat(site): ModifierCard component"
```

---

## Task 11: Stub all MDX pages + wire sidebar

This task gets routing and navigation working before any content is authored. Every page is a stub with just frontmatter and a heading; later tasks fill in the prose.

**Files:**
- Create: 17 stub MDX files under `site/docs/pages/`
- Modify: `site/vocs.config.ts` (add sidebar config)

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p site/docs/pages/getting-started
mkdir -p site/docs/pages/rules
mkdir -p site/docs/pages/mechanics
```

- [ ] **Step 2: Create all 17 stub MDX files**

Use this template for each file. Copy-paste and change title/description/heading per file.

**Template:**
```mdx
---
title: <Title>
description: <One-line description>
---

# <Heading>

_Coming soon._
```

Create these 17 files with these titles:

| File | Title | Description |
|---|---|---|
| `site/docs/pages/index.mdx` (replace existing) | `Siege` | `A turn-based siege game — rules, mechanics, glossary.` |
| `site/docs/pages/getting-started/welcome.mdx` | `Welcome` | `New to Siege? Start here.` |
| `site/docs/pages/getting-started/connect-wallet.mdx` | `Connect your wallet` | `How to connect a Cartridge Controller wallet.` |
| `site/docs/pages/getting-started/first-match.mdx` | `Your first match` | `Finding an opponent and playing your first round.` |
| `site/docs/pages/rules/goal.mdx` | `Goal & win condition` | `What it means to win a match.` |
| `site/docs/pages/rules/round-loop.mdx` | `The round loop` | `How a single round plays out, start to finish.` |
| `site/docs/pages/rules/budget.mdx` | `Budget allocation` | `How to spend your 10 points each round.` |
| `site/docs/pages/rules/commit-reveal.mdx` | `Commit & reveal` | `The two-phase turn system.` |
| `site/docs/pages/rules/scoring.mdx` | `Scoring & damage` | `How damage is calculated and applied.` |
| `site/docs/pages/mechanics/gates.mdx` | `Gates` | `The three gates that defend your vault.` |
| `site/docs/pages/mechanics/modifiers.mdx` | `Gate modifiers` | `Random modifiers that shape each round.` |
| `site/docs/pages/mechanics/nodes.mdx` | `Resource nodes` | `Forge, Quarry, and Grove.` |
| `site/docs/pages/mechanics/traps.mdx` | `Traps` | `Setting traps on your nodes.` |
| `site/docs/pages/mechanics/vault.mdx` | `Vault & repair` | `Vault HP and the repair action.` |
| `site/docs/pages/mechanics/resources.mdx` | `Resources` | `The six resource tokens and what they do.` |
| `site/docs/pages/mechanics/abilities.mdx` | `Abilities` | `Craftable abilities and their effects.` |
| `site/docs/pages/glossary.mdx` | `Glossary` | `Terms used throughout Siege.` |

Replace `<Title>`, `<description>`, and `<Heading>` from the template with the values from the table above for each file.

- [ ] **Step 3: Update `vocs.config.ts` with the sidebar**

Open `site/vocs.config.ts` and add a `sidebar` property to the config object (keep all existing properties):

```ts
// Add this inside defineConfig({...}), alongside title, theme, etc.
sidebar: [
  {
    text: 'Getting Started',
    items: [
      { text: 'Welcome', link: '/getting-started/welcome' },
      { text: 'Connect your wallet', link: '/getting-started/connect-wallet' },
      { text: 'Your first match', link: '/getting-started/first-match' },
    ],
  },
  {
    text: 'Rules',
    items: [
      { text: 'Goal & win condition', link: '/rules/goal' },
      { text: 'The round loop', link: '/rules/round-loop' },
      { text: 'Budget allocation', link: '/rules/budget' },
      { text: 'Commit & reveal', link: '/rules/commit-reveal' },
      { text: 'Scoring & damage', link: '/rules/scoring' },
    ],
  },
  {
    text: 'Mechanics',
    items: [
      { text: 'Gates', link: '/mechanics/gates' },
      { text: 'Gate modifiers', link: '/mechanics/modifiers' },
      { text: 'Resource nodes', link: '/mechanics/nodes' },
      { text: 'Traps', link: '/mechanics/traps' },
      { text: 'Vault & repair', link: '/mechanics/vault' },
      { text: 'Resources', link: '/mechanics/resources' },
      { text: 'Abilities', link: '/mechanics/abilities' },
    ],
  },
  {
    text: 'Glossary',
    link: '/glossary',
  },
],
```

- [ ] **Step 4: Verify the build succeeds and sidebar renders**

Run: `cd site && npm run dev`
Open `http://localhost:5173`. Confirm:
- Sidebar shows Getting Started / Rules / Mechanics / Glossary sections
- Every link clicks through to a "Coming soon" stub without 404s
- No console errors

Ctrl-C to stop.

- [ ] **Step 5: Run build**

Run: `cd site && npm run build`
Expected: clean build, no broken links.

- [ ] **Step 6: Commit**

```bash
git add site/docs/pages/ site/vocs.config.ts
git commit -m "feat(site): scaffold MDX page stubs and wire sidebar navigation"
```

---

## Task 12: Write Getting Started content

**Files:**
- Modify: `site/docs/pages/getting-started/welcome.mdx`
- Modify: `site/docs/pages/getting-started/connect-wallet.mdx`
- Modify: `site/docs/pages/getting-started/first-match.mdx`

**Tone:** Light lore flavoring (option B from spec). Each page opens with a one-line in-world framing, then reads like clear reference prose. Keep sentences short. Mechanics must be accurate.

- [ ] **Step 1: Rewrite `welcome.mdx`**

Replace the stub with a page covering:

- **Section 1 — What Siege is:** Asymmetric turn-based strategy game on Starknet. Each round, you split a 10-point budget across attack, defense, and node contests. First to drain the opponent's Vault HP to 0 wins.
- **Section 2 — What you'll need:** A Starknet wallet (Cartridge Controller, free, browser-based), one opponent, about 10 minutes per match.
- **Section 3 — How to keep reading:** Next step links to `connect-wallet`, then `first-match`.

Frontmatter:
```mdx
---
title: Welcome
description: New to Siege? Start here.
---
```

Lead with one italic line of framing, e.g.:
> *The council has called for commanders. Here begins your first dispatch.*

Then the three sections. End with a link to "Connect your wallet".

- [ ] **Step 2: Rewrite `connect-wallet.mdx`**

Cover:

- **Cartridge Controller** — a gasless, session-based wallet that runs in the browser. No extension needed.
- **How to connect:** Open the game client, click "Connect", Controller pops up, create a passkey (or reuse existing), done. Sessions persist for gameplay entrypoints — no per-transaction prompts.
- **What sessions cover:** Creating a match, committing, revealing attacker/defender moves (all gaslessly).
- **Troubleshooting note:** If the connect button doesn't open a popup, disable popup blockers for the site.

Frontmatter:
```mdx
---
title: Connect your wallet
description: How to connect a Cartridge Controller wallet to play Siege.
---
```

- [ ] **Step 3: Rewrite `first-match.mdx`**

Cover:

- **Creating a match:** Click "Create Match" in the client, share the match link with your opponent.
- **Joining a match:** Open a shared link, confirm, you're in.
- **The first round:** Allocate your budget (attack / defense / nodes), commit, wait for the opponent, reveal. Cross-link to `/rules/round-loop` and `/rules/budget`.
- **What to expect:** A match ends when one vault hits 0 HP, typically 3-6 rounds.

Frontmatter:
```mdx
---
title: Your first match
description: Finding an opponent and playing your first round.
---
```

- [ ] **Step 4: Verify the build**

Run: `cd site && npm run build`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add site/docs/pages/getting-started/
git commit -m "docs(site): write Getting Started content"
```

---

## Task 13: Write Rules content

**Files:**
- Modify: `site/docs/pages/rules/goal.mdx`
- Modify: `site/docs/pages/rules/round-loop.mdx`
- Modify: `site/docs/pages/rules/budget.mdx`
- Modify: `site/docs/pages/rules/commit-reveal.mdx`
- Modify: `site/docs/pages/rules/scoring.mdx`

**Source of truth:** `CLAUDE.md` sections on 1v1 Mode, Budget Allocation, Gate Modifiers, Node Traps. Verify values against `CLAUDE.md` before authoring.

- [ ] **Step 1: Write `goal.mdx`**

Cover:

- The win condition: reduce the opponent's Vault HP from 50 to 0.
- Each player both attacks and defends with a shared 10-point budget per round (+ bonuses from controlled nodes).
- A match ends immediately when a vault hits 0; first to inflict that wins.
- Ties are resolved in favor of the defender (player who took damage second).

One italic framing line at top, e.g.:
> *Every siege ends one of two ways. Yours, or theirs.*

- [ ] **Step 2: Write `round-loop.mdx`**

Cover the round sequence, in order:

1. **Modifier roll** — each gate independently rolls a modifier via Cartridge vRNG. Both players see the modifiers before allocating.
2. **Allocation** — each player fills in their 13-slot allocation privately (attack to 3 pressure points, defense to 3 gates, repair, node contests, traps).
3. **Commit** — each player submits a Poseidon hash of their allocation + a random salt.
4. **Reveal** — once both have committed, each player reveals their full allocation plus salt. The contract verifies the hash.
5. **Resolution** — damage is computed per gate (with modifiers applied), repair is subtracted, node contests award resources, traps trigger on contested nodes, abilities are applied. Vault HP is updated.
6. **Loop** — if both vaults are alive, continue to the next round.

End with a link to `budget`, `commit-reveal`, and `scoring`.

- [ ] **Step 3: Write `budget.mdx`**

Cover:

- Each round, your budget is **10 base points** + any node bonuses from nodes you controlled last round.
- The budget is split across a **13-slot allocation array**:

  | Index | Slot | Purpose |
  |---|---|---|
  | 0–2 | Attack (p0, p1, p2) | Pressure at each of the 3 gates |
  | 3–5 | Defense (g0, g1, g2) | Defense at each of the 3 gates |
  | 6 | Repair | Heal vault HP (max 3) |
  | 7–9 | Nodes (nc0, nc1, nc2) | Contest Forge, Quarry, Grove |
  | 10–12 | Traps (trap0, trap1, trap2) | Set a trap on a node you own (cost 2 each) |

- Any unused budget is lost; spend it or waste it.
- The full 14-element Poseidon hash is `[salt, ...allocation]`.

Show the allocation array in a typed code block:
```ts
// [p0, p1, p2, g0, g1, g2, repair, nc0, nc1, nc2, trap0, trap1, trap2]
```

- [ ] **Step 4: Write `commit-reveal.mdx`**

Cover:

- **Why commit-reveal?** Both players must decide their moves without seeing the other's, but the contract needs to verify they didn't change their minds after seeing the opponent.
- **Commit phase:** You pick a random salt and compute `poseidon_hash([salt, ...allocation])`. You submit just the hash.
- **Reveal phase:** Once both commits are on-chain, you reveal the full allocation plus your salt. The contract recomputes the hash and verifies it matches your commit. Cheating (changing your mind) fails verification.
- **Missed reveals:** If you commit but don't reveal within the time window, you lose that round's actions.

- [ ] **Step 5: Write `scoring.mdx`**

Cover:

- For each gate, the attacker's pressure and the defender's defense are combined with the gate's modifier (see `/mechanics/modifiers`).
- Base damage = max(0, attack − defense).
- Modifiers transform this: Narrow Pass caps both values at 3, Mirror Gate swaps them, Deadlock zeroes damage, Reflection distributes damage to other gates.
- Repair (if allocated) heals the vault *after* damage is applied, capped at the vault's max HP.
- Node trap triggers: if you contest a trapped node owned by the opponent, you take 5 direct vault damage that bypasses repair.

Cross-link to `/mechanics/modifiers`, `/mechanics/vault`, `/mechanics/traps`.

- [ ] **Step 6: Verify the build**

Run: `cd site && npm run build`
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add site/docs/pages/rules/
git commit -m "docs(site): write Rules content"
```

---

## Task 14: Write Mechanics content — gates, modifiers, nodes, traps

**Files:**
- Modify: `site/docs/pages/mechanics/gates.mdx`
- Modify: `site/docs/pages/mechanics/modifiers.mdx`
- Modify: `site/docs/pages/mechanics/nodes.mdx`
- Modify: `site/docs/pages/mechanics/traps.mdx`

- [ ] **Step 1: Write `gates.mdx`**

Cover:

- There are **three gates** between every attacker and the vault behind them (g0, g1, g2). Think of them as lanes.
- Each gate independently resolves its own attack/defense math each round.
- Damage is computed per gate. Excess attack beyond what defense blocks goes through to the vault.
- Every gate can be subject to a **modifier** that changes how its resolution works — cross-link to `/mechanics/modifiers`.

- [ ] **Step 2: Write `modifiers.mdx`**

Cover:

- At the start of each round, every gate rolls one modifier independently using Cartridge's vRNG.
- Modifiers are visible to both players before allocation — plan around them.
- Modifiers last one round only.
- Render all 5 modifiers as cards using the `ModifierCard` component.

Required imports and usage:

```mdx
---
title: Gate modifiers
description: Random modifiers that shape each round.
---

import { ModifierCard } from '@/components/ModifierCard'
import { MODIFIERS } from '@/data/modifiers'

# Gate modifiers

_At dawn, each gate is rolled anew — and the day bends around what the gods decided._

At the start of every round, each of the three gates independently rolls a modifier. Both players see all three modifiers before they allocate their budget, so you can plan around Mirror Gates and avoid wasting pressure on Deadlocks.

Modifiers apply for one round only. Next dawn, they roll again.

## The five modifiers

{MODIFIERS.map(m => <ModifierCard key={m.slug} modifier={m} />)}
```

- [ ] **Step 3: Write `nodes.mdx`**

Cover:

- There are **three resource nodes** on the map: **Forge**, **Quarry**, and **Grove**.
- Each round you can allocate budget to **contest** a node (slots nc0, nc1, nc2). The player with more allocated budget to a node controls it for the next round.
- Controlling a node gives you:
  - **Budget bonus** — one extra budget point next round per controlled node
  - **Resources** — at the end of the round, you mint 1 of each paired token (see `/mechanics/resources`)
- Contest ties are resolved in favor of the current controller.

Cross-link to `/mechanics/resources` and `/mechanics/traps`.

- [ ] **Step 4: Write `traps.mdx`**

Cover:

- You can trap nodes **you currently own**.
- Cost: **2 budget points** per trap (slots trap0, trap1, trap2 in the allocation).
- Effect: if your opponent takes a trapped node (i.e. they contest and you can't hold it), they take **5 vault damage**. This damage bypasses repair.
- **Tradeoff:** trapping costs you the ability to contest for that node — your own contest spend at the trapped slot is zero.
- Traps last exactly one round. Re-place them every round if you want ongoing coverage.
- Traps are **hidden**. They're included in the Poseidon commit-reveal hash, so your opponent only learns a trap existed after they trigger it.

- [ ] **Step 5: Verify the build and check ModifierCard renders**

Run: `cd site && npm run dev`
Open `http://localhost:5173/mechanics/modifiers`.
Verify: all 5 modifier cards render with name, probability %, flavor, and effect.

Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add site/docs/pages/mechanics/gates.mdx site/docs/pages/mechanics/modifiers.mdx site/docs/pages/mechanics/nodes.mdx site/docs/pages/mechanics/traps.mdx
git commit -m "docs(site): write gates, modifiers, nodes, traps pages"
```

---

## Task 15: Write Mechanics content — vault, resources, abilities

**Files:**
- Modify: `site/docs/pages/mechanics/vault.mdx`
- Modify: `site/docs/pages/mechanics/resources.mdx`
- Modify: `site/docs/pages/mechanics/abilities.mdx`

- [ ] **Step 1: Write `vault.mdx`**

Cover:

- Every player starts the match with a vault at **50 HP**.
- Incoming gate damage (and Ember Blast and trap triggers) subtracts from this total.
- **Repair** — you can allocate up to **3 points** of your budget each round to the repair slot. Each repair point heals 1 HP. Repair applies *after* damage, and cannot exceed the max vault HP of 50.
- Trap damage and Ember Blast specifically **bypass repair** — they hit after the repair calc is done, so you can't heal away a trap hit mid-round.
- When a vault reaches 0 HP, that player loses the match immediately.

Cross-link to `/mechanics/traps` and `/mechanics/abilities`.

- [ ] **Step 2: Write `resources.mdx`**

Cover:

- Siege has **six resource tokens** (ERC-20, 0 decimals), minted whenever you control a node at round end.
- Resources persist across matches. You can trade them, hold them, or spend them to craft abilities.
- List the pairs:

  | Node | Token 1 | Token 2 |
  |---|---|---|
  | **Forge** | IRON | LINEN |
  | **Quarry** | STONE | WOOD |
  | **Grove** | EMBER | SEEDS |

- When you control a node at round end, you mint **1 of each** of its paired tokens (e.g. Forge → 1 IRON + 1 LINEN).

Cross-link to `/mechanics/nodes` and `/mechanics/abilities`.

- [ ] **Step 3: Write `abilities.mdx`**

This is the data-driven page with cards. Template:

```mdx
---
title: Abilities
description: Craftable abilities that shape the battle.
---

import { AbilityCard } from '@/components/AbilityCard'
import { ABILITIES } from '@/data/abilities'

# Abilities

_The quartermaster's ledger lists five devices a commander may craft, each sealed with their own mark._

Abilities are **craftable items** that consume resources and grant one-shot mechanical effects during a round. Each ability is a tradeable ERC-1155 token (visible in your Cartridge wallet) — craft them, hold them, spend them when the moment calls for it.

## Crafting

To craft an ability, spend the listed resource costs. The game burns the tokens and mints a 1/1 ability token to your address. Crafting is gasless through your Controller session.

## The five T1 abilities

{ABILITIES.map(a => <AbilityCard key={a.id} ability={a} />)}

## Individual abilities

{ABILITIES.map(a => (
  <section id={a.slug} key={a.id}>
    <h3>{a.name}</h3>
    <AbilityCard ability={a} />
  </section>
))}
```

- [ ] **Step 4: Verify AbilityCard renders correctly**

Run: `cd site && npm run dev`
Open `http://localhost:5173/mechanics/abilities`.
Verify: all 5 ability cards render with icon, name, T1 pill, flavor, effect, and cost row.

Check the individual ability anchors work: `http://localhost:5173/mechanics/abilities#siege-sword` should scroll to that section.

Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add site/docs/pages/mechanics/vault.mdx site/docs/pages/mechanics/resources.mdx site/docs/pages/mechanics/abilities.mdx
git commit -m "docs(site): write vault, resources, abilities pages"
```

---

## Task 16: Write Glossary

**Files:**
- Modify: `site/docs/pages/glossary.mdx`

- [ ] **Step 1: Write `glossary.mdx`**

Hand-written alphabetized definition list. One italic framing line at top, then a `##` for each term, then a 1–3 sentence definition. Include at least these 28 terms:

```
Ability
Allocation
Attack (p0 / p1 / p2)
Budget
Cartridge Controller
Commit phase
Commitment
Contest (node)
Deadlock
Defense (g0 / g1 / g2)
Ember Blast
Fortify
Forge
Gate
Gate modifier
Grove
Hex
Mirror Gate
Narrow Pass
Node
Normal (modifier)
Poseidon hash
Quarry
Reflection
Repair
Reveal phase
Round
Salt
Siege Sword
Stone Cloak
Trap
Vault HP
vRNG
```

Alphabetize the final list. For each term, write a concise 1–3 sentence definition based on CLAUDE.md and the spec. Example format:

```mdx
## Allocation
The 13-element array a player fills in each round, covering attack (3 slots), defense (3 slots), repair (1 slot), node contests (3 slots), and traps (3 slots). Each slot's value is the budget points assigned to it.
```

Frontmatter:
```mdx
---
title: Glossary
description: Terms used throughout Siege.
---
```

- [ ] **Step 2: Verify the build**

Run: `cd site && npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add site/docs/pages/glossary.mdx
git commit -m "docs(site): write glossary"
```

---

## Task 17: Write landing page

**Files:**
- Modify: `site/docs/pages/index.mdx`

- [ ] **Step 1: Rewrite `site/docs/pages/index.mdx`**

Replace whatever scaffold content is there with a landing page that:

- Opens with a prominent title ("**Siege**") and a 1-2 sentence tagline in italic tone B.
- Has 3-4 large link cards to key sections: "New here? Start with Welcome", "Learn the rules", "Deep dive into mechanics", "Glossary".
- Does NOT duplicate sidebar navigation (Vocs already shows the sidebar).
- Does NOT have a `showSidebar: false` frontmatter — we want the sidebar visible everywhere.

Template:

```mdx
---
title: Siege
description: A turn-based siege game — rules, mechanics, glossary.
---

# Siege

_A council calls. Two commanders gather their coin and their cunning. Three gates stand between you and defeat._

Welcome to the field manual.

## Where to start

- **[Welcome](/getting-started/welcome)** — new here? begin at the beginning.
- **[The rules](/rules/goal)** — goal, round loop, budget, scoring.
- **[Mechanics](/mechanics/gates)** — gates, nodes, traps, resources, abilities.
- **[Glossary](/glossary)** — every term, alphabetized.

## What you're reading

This is a player's guide to **Siege**, the 1v1 mode currently live on Starknet Sepolia. Everything here describes the game as it exists today. More documentation will land alongside new features (Kingdoms, Reputation, Conquest, Pillaging) as they ship.
```

- [ ] **Step 2: Verify the build**

Run: `cd site && npm run build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add site/docs/pages/index.mdx
git commit -m "docs(site): write landing page"
```

---

## Task 18: Final acceptance sweep

This is the acceptance criteria gate from the spec. Every criterion must pass before declaring the site done.

- [ ] **Step 1: Run the full test suite**

Run: `cd site && npm test`
Expected: all tests across `abilities`, `modifiers`, `resources`, `AbilityCard`, `ModifierCard` pass. 0 failures.

- [ ] **Step 2: Clean build**

Run: `cd site && rm -rf docs/dist && npm run build`
Expected: clean build, produces `site/docs/dist/`. No errors, no warnings about broken links.

- [ ] **Step 3: Dev server + manual page walk**

Run: `cd site && npm run dev`
Open `http://localhost:5173`.

Click through every sidebar link and verify:

1. Landing page (`/`) — title, tagline, 4 link cards, no console errors
2. `/getting-started/welcome` — has content (not "Coming soon")
3. `/getting-started/connect-wallet` — has content
4. `/getting-started/first-match` — has content
5. `/rules/goal` — has content
6. `/rules/round-loop` — has content with the 5-step sequence
7. `/rules/budget` — has content with the 13-slot table
8. `/rules/commit-reveal` — has content
9. `/rules/scoring` — has content
10. `/mechanics/gates` — has content
11. `/mechanics/modifiers` — **all 5 modifier cards render** (Normal 60%, Narrow Pass 10%, Mirror Gate 10%, Deadlock 10%, Reflection 10%)
12. `/mechanics/nodes` — has content
13. `/mechanics/traps` — has content
14. `/mechanics/vault` — has content
15. `/mechanics/resources` — has content with the 3x2 resource table
16. `/mechanics/abilities` — **all 5 ability cards render** with icons, T1 pill, flavor, effect, cost rows
17. `/glossary` — alphabetized list with at least 28 terms

For each page: no 404s, no console errors, no broken images, no missing styles.

Ctrl-C to stop.

- [ ] **Step 4: Visual consistency spot check**

Still running dev server if you like. Compare visually to the frontend:
- Background: desk image visible through dark overlay ✓
- Text: warm cream color ✓
- Headings: gold/accent color ✓
- Font: Cinzel (or similar serif) ✓
- Panel cards: brown/parchment gradient with border ✓

If anything looks off, check `site/docs/styles.css` against `frontend/src/app/globals.css`.

- [ ] **Step 5: Git status clean**

Run: `git status`
Expected: working tree clean, all changes committed.

Run: `git log --oneline worktree-siege-docs ^main`
Expected: the full sequence of commits from Task 1 through Task 17. Verify each task produced its own commit.

- [ ] **Step 6: Report**

Report to the user:
- ✅ Site live at `http://localhost:5173` via `cd site && npm run dev`
- ✅ Build clean via `cd site && npm run build`
- ✅ Tests passing (N tests)
- ✅ All 17 pages authored, no placeholder stubs
- ✅ All 5 ability cards, all 5 modifier cards rendering
- ✅ Theme ported from frontend — visually consistent
- Branch `worktree-siege-docs` has N commits ahead of main
- Next step: user reviews the site, then we merge to main

---

## Done criteria

This plan is complete when:

1. `cd site && npm install && npm run dev` serves the site on `:5173` with zero errors
2. `cd site && npm run build` produces a clean static build in `site/docs/dist`
3. Every sidebar link resolves to a real authored page (no "Coming soon" stubs)
4. All 5 abilities render via `<AbilityCard>` on `/mechanics/abilities`
5. All 5 gate modifiers render via `<ModifierCard>` on `/mechanics/modifiers`
6. Visual consistency with the frontend (dark, parchment, gold, desk background, Cinzel serif)
7. Glossary has ≥28 alphabetized terms
8. All tests pass (`cd site && npm test`)
9. No broken images, no console errors in the dev browser
