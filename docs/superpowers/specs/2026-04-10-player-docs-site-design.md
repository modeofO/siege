# Player Documentation Site Design

**Date:** 2026-04-10
**Status:** Approved design
**Depends on:** Nothing (greenfield subproject)

## Problem

Siege has no player-facing documentation. New players landing on the game client have no explanation of the rules, mechanics, glossary, or how to connect a wallet and start a match. A short in-game help modal is not enough — the game has 13 allocation slots per round, 5 gate modifiers with probabilities, 6 resource tokens, 5 craftable abilities, and commit-reveal mechanics that need a referenceable surface.

This spec describes a standalone documentation site that covers the **currently live** 1v1 mode on Sepolia, with room to expand once the in-flight game direction redesign lands.

## Scope

Build a standalone Vocs documentation site at `site/` in the repo root, themed to match the current game client, deployed (eventually) to a subdomain. Content covers 1v1 as it exists on Sepolia today: getting started, rules, mechanics, and a glossary.

This project is **local development only** for v1. Production deployment (Railway + Cloudflare DNS) is mentioned once as a footnote and will be designed separately.

**Out of scope:**
- Production deployment, CI/CD, analytics, sitemaps, redirects from the game client
- Strategy/tips/meta pages (opinionated and dates fast)
- Developer/contract/CLI documentation (players-only scope)
- 2v2 mode documentation
- Anything from the game direction redesign (Kingdoms, Reputation, Conquest, Pillaging, Championship, T2/T3 abilities, Factions, Campaigns, Soulbound trophies) — deferred until those ship
- Interactive widgets (budget allocator, modifier simulator) — v2 stretch
- i18n / multi-language support

## Decision summary

Recorded from the brainstorming Q&A:

| Decision | Choice | Rationale |
|---|---|---|
| Content scope | Current live 1v1 only | Ship accurate docs now, expand as features ship |
| Framework | Vocs standalone subproject | Scope justifies the polish; avoids hand-rolling sidebar/search |
| Interactivity | Static MDX + data-driven cards | `AbilityCard`/`ModifierCard` from typed data; no live widgets in v1 |
| Information architecture | Getting Started / Rules / Mechanics / Glossary | Matches "rules + glossary + mechanics" phrasing; easy to expand |
| Deploy topology | `docs` subdomain (future) | Least-fragile infra; Railway + Cloudflare noted but deferred |
| Tone | Light lore flavoring | Thin narrative skin, mechanically accurate, still scannable |

## Architecture & project layout

A new Vocs project at `site/` at the repo root, fully independent from `frontend/`. Vocs is Vite + React — no overlap with the Next.js build pipeline.

```
siege/
├── frontend/               # existing Next.js game client (untouched)
├── docs/                   # existing internal specs/plans (untouched)
├── site/                   # NEW — player-facing docs site
│   ├── docs/               # Vocs content root
│   │   ├── pages/
│   │   │   ├── index.mdx                    # landing
│   │   │   ├── getting-started/
│   │   │   │   ├── welcome.mdx
│   │   │   │   ├── connect-wallet.mdx
│   │   │   │   └── first-match.mdx
│   │   │   ├── rules/
│   │   │   │   ├── goal.mdx
│   │   │   │   ├── round-loop.mdx
│   │   │   │   ├── budget.mdx
│   │   │   │   ├── commit-reveal.mdx
│   │   │   │   └── scoring.mdx
│   │   │   ├── mechanics/
│   │   │   │   ├── gates.mdx
│   │   │   │   ├── modifiers.mdx
│   │   │   │   ├── nodes.mdx
│   │   │   │   ├── traps.mdx
│   │   │   │   ├── vault.mdx
│   │   │   │   ├── resources.mdx
│   │   │   │   └── abilities.mdx           # overview + crafting + all 5 cards
│   │   │   └── glossary.mdx
│   │   ├── public/
│   │   │   ├── images/                     # mechanic diagrams
│   │   │   ├── sprites/                    # copies of ability/resource icons
│   │   │   └── desk_preview.png            # same background as the game client
│   │   └── styles.css                      # auto-loaded by Vocs; ported from frontend/src/app/globals.css
│   ├── src/
│   │   ├── components/
│   │   │   ├── AbilityCard.tsx
│   │   │   └── ModifierCard.tsx
│   │   └── data/
│   │       ├── abilities.ts                # 5 T1 abilities as typed data
│   │       ├── modifiers.ts                # 5 gate modifiers as typed data
│   │       └── resources.ts                # 6 resource tokens
│   ├── vocs.config.ts
│   ├── package.json
│   └── tsconfig.json
```

Key properties:

- `site/docs/` is Vocs' content root (where pages live). It does **not** collide with the repo's top-level `docs/` internal specs folder because it's nested under `site/`.
- `site/src/` holds React components and TS data files. Vocs auto-wires them up for MDX imports.
- Assets are **copied** from `frontend/public/sprites/...` into `site/docs/public/...`, not symlinked. Vocs' Vite pipeline doesn't follow symlinks reliably, and a shared-assets npm package is overkill for a handful of PNGs. Copies stay in sync manually.
- One `package.json` at `site/` with a minimal dep set: `vocs`, `react`, `react-dom`, dev types. No Next.js, no Starknet.js, no Cartridge — this is a pure static docs site.
- Local dev: `cd site && npm run dev` serves on `http://localhost:5173`. No conflict with `frontend` (`:3000`) or Katana (`:5050`).

## Theming strategy

Vocs has two theming knobs: `theme.variables` in `vocs.config.ts` (lightweight config-object overrides), and a custom `styles.css` at the root of the `docs/` content directory (deep — full CSS, auto-loaded, no config needed). This project uses the deep one because we're porting a background image, a serif font, panel gradients, and more custom variables than the config-object approach comfortably supports.

**Source of truth:** `frontend/src/app/globals.css` — palette on lines 1–19, body background + dim overlay on lines 21–43, `.panel-medieval` on lines 102–106. (Current as of 2026-04-10; if that file moves or gets refactored, update this reference.)

**Port target:** `site/docs/styles.css`. Vocs auto-detects and imports this file — no entry needed in `vocs.config.ts`.

### 1. Override Vocs built-in variables

```css
/* site/docs/styles.css */
:root.dark {
  /* Vocs built-ins → siege palette */
  --vocs-color_background: #0d0b0a;
  --vocs-color_background2: #1a1714;
  --vocs-color_background3: #252019;
  --vocs-color_border: #3d3428;
  --vocs-color_text: #d4cfc6;
  --vocs-color_text2: #7a7060;
  --vocs-color_textAccent: #daa520;

  /* Custom vars for components */
  --siege-color-accent: #b8860b;
  --siege-color-parchment: #2a2318;
  --siege-color-friendly: #c8a44e;
  --siege-color-enemy: #c44332;
}
```

`vocs.config.ts` sets `theme.colorScheme: 'dark'` and `theme.accentColor: { dark: '#daa520' }` so the site locks to dark mode — matches the game client, no light-mode toggle.

### 2. Desk background and dim overlay

```css
body {
  background-image: url('/desk_preview.png');
  background-size: cover;
  background-position: center;
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
```

The PNG is copied from `frontend/public/sprites/desk_preview.png` → `site/docs/public/desk_preview.png` during scaffold. Same file, independent copies.

### 3. Shared panel utility

```css
.panel-medieval {
  background: linear-gradient(135deg, var(--vocs-color_background2) 0%, var(--siege-color-parchment) 100%);
  border: 1px solid var(--vocs-color_border);
  border-radius: 4px;
}
```

`AbilityCard` and `ModifierCard` consume `.panel-medieval` so the components don't know anything about colors directly.

### Font

`--vocs-fontFamily_default` set to the same display serif the game client currently uses, loaded via a `<link>` tag injected in Vocs' `head` config. Exact font name to be confirmed during implementation by grepping `frontend/` for the current `--font-serif` value; fall back to Cinzel if nothing is loaded.

### What's not being done

- Not importing `frontend/src/app/globals.css` directly — Vocs can't consume it, and Tailwind 4's `@theme` directive won't work inside Vocs anyway.
- Not using a shared npm workspace for theme tokens — overkill for ~20 CSS variables.

## Content model & components

Two React components are the only non-MDX code in the project. Everything else is MDX. Rule: components render from typed data files, and every MDX page that needs them imports the data — no ability stats hand-typed in prose.

### Data files

`site/src/data/abilities.ts` is the single source of truth for the 5 T1 abilities. Values come from CLAUDE.md's T1 ability table.

```ts
// site/src/data/abilities.ts
export type ResourceToken =
  | 'iron' | 'linen' | 'stone' | 'wood' | 'ember' | 'seeds';

export type ResourceCost = { token: ResourceToken; amount: number };

export type Ability = {
  id: number;              // matches on-chain token ID 1..5
  slug: string;            // URL-safe, e.g. "siege-sword"
  name: string;
  tier: 1 | 2 | 3;
  flavor: string;          // one-line lore (tone B)
  effect: string;          // plain-English mechanical effect
  cost: ResourceCost[];
  iconPath: string;        // /sprites/abilities/siege-sword.png
};

export const ABILITIES: Ability[] = [
  {
    id: 1,
    slug: 'siege-sword',
    name: 'Siege Sword',
    tier: 1,
    flavor: 'Forged for one purpose: to find the crack in a gate.',
    effect: 'Deals maximum damage (10) to one chosen gate.',
    cost: [
      { token: 'iron', amount: 3 },
      { token: 'wood', amount: 2 },
    ],
    iconPath: '/sprites/abilities/siege-sword.png',
  },
  // ... 4 more (Stone Cloak, Ember Blast, Hex, Fortify)
];
```

`site/src/data/modifiers.ts` — same shape for the 5 gate modifiers (Normal, Narrow Pass, Mirror Gate, Deadlock, Reflection) with `name`, `probability` (as a percentage), `flavor`, `effect`.

`site/src/data/resources.ts` — the 6 resource tokens with `name`, `node` (`'forge' | 'quarry' | 'grove'`), `pair` (the sibling token on the same node), `iconPath`. Used by the Resources page and by `AbilityCard` to render cost icons.

### Components

`AbilityCard.tsx` takes a single `ability: Ability` prop and renders a `.panel-medieval`-styled card: icon top-left, name + tier pill top-right, flavor in italic, effect in plain text, cost row at the bottom (one resource icon + number per `cost` entry). The cost row looks up icons by token name in `RESOURCES`. Implementation is small (~60 lines including JSX).

`ModifierCard.tsx` has the same shape, takes a `Modifier`, shows probability as a colored tag, flavor + effect below.

### Usage in MDX

`site/docs/pages/mechanics/abilities.mdx`:

```mdx
---
title: Abilities
description: The five T1 abilities and how to craft them.
---

import { AbilityCard } from '@/components/AbilityCard'
import { ABILITIES } from '@/data/abilities'

# Abilities

The quartermaster's ledger lists five devices a commander may craft...

<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {ABILITIES.map(a => <AbilityCard key={a.id} ability={a} />)}
</div>

## Individual abilities

{ABILITIES.map(a => (
  <section id={a.slug} key={a.id}>
    <h3>{a.name}</h3>
    <AbilityCard ability={a} />
  </section>
))}
```

One page, five cards at top, five detailed sections below — all generated from the same data array. Update `abilities.ts` and every card, every section, every mention updates.

The `@/` prefix is a path alias pointing at `site/src/`. It needs to be configured in two places at scaffold time: `site/tsconfig.json` (`compilerOptions.paths`) and Vocs' Vite-level resolver via `vocs.config.ts` (`vite.resolve.alias`). Both point `@/*` at `./src/*` relative to the `site/` root. Without this, MDX imports fall back to brittle relative paths like `../../../src/components/...`.

### Glossary page

`site/docs/pages/glossary.mdx` is a hand-written alphabetized definition list — no component, no data file. Terms drawn from CLAUDE.md + memory: "Commit phase," "Gate modifier," "Vault HP," "Budget," "Trap," "Node contest," etc. Glossary-as-data is over-engineering for ~30 terms.

### What's not data-driven

- Rules pages (goal, round loop, budget, commit/reveal, scoring) are pure MDX prose. No components. Rules don't have a shape that benefits from typing.
- Gate/node/trap/vault mechanics pages are prose + static images + tables.
- No shared `<Callout>` or `<Note>` wrapper — Vocs ships with `:::tip` / `:::warning` MDX containers already.

## Local development workflow

Production deployment (Railway + Cloudflare DNS for a `docs` subdomain) is explicitly deferred. v1 is local-only.

```bash
cd site
npm install
npm run dev          # Vocs dev server on http://localhost:5173
npm run build        # static build → site/docs/dist/
```

No environment variables. No wallet integration. No contract calls. The site is 100% static.

## Acceptance criteria

1. `cd site && npm install && npm run dev` serves the site on `:5173` with zero errors
2. `cd site && npm run build` produces a clean static build in `site/docs/dist`
3. Every sidebar link in the IA resolves to a real page (no 404s, no TODO placeholder pages)
4. All 5 abilities render via `<AbilityCard>` on `mechanics/abilities.mdx`
5. All 5 gate modifiers render via `<ModifierCard>` on `mechanics/modifiers.mdx`
6. The site visually reads as "same universe" as the game client — dark, parchment, gold accents, desk background, serif display font
7. Glossary has the full draft term list, each with a 1–3 sentence definition, alphabetized
8. No broken image references, no console errors in the dev browser

## Open questions resolved during implementation

- **Exact display font:** grep `frontend/` for the current `--font-serif` value; fall back to Cinzel if nothing loaded.
- **Final glossary term list:** drafted from CLAUDE.md + memory during implementation, user reviews.
- **Ability sprites:** check `frontend/public/sprites/abilities/` during implementation. If they don't exist, use text-only cards for v1 and flag it — don't block on art.
