# Frontend Notes

The frontend supports `devnet`, `katana`, `sepolia`, and `mainnet` modes through `src/app/providers.tsx` (`NEXT_PUBLIC_NETWORK`).

- Devnet uses local Katana accounts.
- Sepolia and mainnet use Cartridge Controller and `SESSION_POLICIES`.
- Session policies are fixed when the player connects. After adding policies, tell players to reconnect.
- The world UI renders `HexGrid`.
- gRPC subscriptions are the default read path. Do not add new GraphQL queries,
  and do not add a new SQL poller without a reason the read cannot be a
  subscription — see "Reads" below.
- Torii stores u64 key columns (e.g. `match_id`) as zero-padded hex text; use `sqlU64()` from `toriiSql.ts` for comparisons.
- `NEXT_PUBLIC_TORII_URL` is required — `toriiSql.ts` defaults to localhost otherwise.

## Reads

Two subscription entry points, each opened once by the page that needs it:
`useMatchState1v1` (match page) and `useWorldSubscription` (/world). Every other
hook is a pure `useModels` + `useMemo` selector over the global Dojo store those
populate. A selector called on a page that has not opened the matching
subscription silently returns empty data.

Ranked/windowed views (top-N) subscribe with a member clause and re-derive
the window client-side: `useActiveBattles` selects over the
`status Eq 'Active'` subscription (opened in `useWorldSubscription`), filters,
sorts and slices in the selector, because a stream cannot retract a row
displaced from the window. This needs torii >= 1.8.12/1.8.15 (deployed:
1.8.16), where clause matching considers both old and new entity state so a
match leaving the clause is still broadcast. Only do this for sets that stay
small (concurrent active matches); for unbounded history (a leaderboard over
all matches ever) poll a one-shot gRPC `RetrieveEntities` with member clause +
`order_by` + `limit` instead. Torii SQL remains for one-shot reads after a tx
(`fetchConquestOutcome`, the match page's post-tx poll). `usePoll` skips ticks
while the tab is hidden and catches up on re-show.

Known tradeoff: /world now makes zero periodic Torii reads, so
`useToriiHealth` (fed only by SQL reads) cannot flip on that page — a dead
subscription stream shows as quietly stale data, not as unhealthy. Accepted
for architectural consistency; revisit if stuck pages are ever reported.

Measured facts about torii query semantics the SDK docs do not tell you. Both
deployments run torii 1.8.16 (verified 2026-07-26); the version-dependent one
is marked:

- **Always set `withEntityModels`.** Without it a query returns every model in
  the world. (The published gRPC docs are a version behind: their
  `entity_models` is the installed client's `models`, i.e. `withEntityModels`.
  Their wildcard example `keys: [""]` also panics the wasm client — use
  `[undefined]`.)
- **KeysClause key filtering is version-split.** Through torii 1.8.3 the key
  binding was vacuous — a bound address and an address that exists nowhere both
  returned every row (broken world-scoping in the filter SQL; fixed by PR #366
  in 1.8.4). On the deployed 1.8.16 it filters correctly. Store selectors
  re-filter by address client-side anyway — correct under both behaviors, and
  the world subscription is deliberately wildcard-keyed because it wants every
  row.
- **Group models by key shape.** Because keys now filter, a model whose key is
  not the clause key never matches: PlayerCosmetics (keyed by player) riding a
  match-id-keyed clause silently returns nothing. One clause per key shape —
  see `useMatchState1v1`, which runs a separate wildcard query for cosmetics.
- **Page limit defaults to 100 and `useEntityQuery` merges only the first
  page.** It never follows `next_cursor`, so anything past the limit is dropped
  with no error. Measured on mainnet, the default returns 7 of 96 parcels.
  Always call `withLimit`. (SDK behavior — unchanged by the torii upgrade.)
- **`addOrderBy` needs a model-qualified field.**
  `"siege_dojo-MatchState1v1.match_id"` works; bare `"match_id"` errors with
  `Invalid cursor: no column found`. Unit-variant enums compare with a plain
  variant-name string (`MemberClause(..., "status", "Eq", "Active")`).
- **Entity ids collide across models on small integer keys.** Parcel 5 and
  match 5 hash to the same entity id. Harmless for reads (`useModels` selects
  one model per entity), but keys alone cannot isolate a model — the models
  filter does that.

Use `BigInt(0)` rather than `0n` in frontend code.

`src/bindings/typescript/*.gen.ts` are generated — don't hand-edit them. To
regenerate, from the repo root:

```bash
docker compose run --rm builder sozo -P katana build --typescript
cp bindings/typescript/*.gen.ts frontend/src/bindings/typescript/
cd frontend && bun x prettier --write src/bindings/typescript
```

The `-P` is required. There is no `dojo_dev.toml`, so the default `dev` profile
compiles fine and then fails binding generation with a bare
`No such file or directory (os error 2)`. Any real profile works; the bindings
do not differ between them. Output lands in a gitignored `/bindings/` staging
dir, not directly in the frontend.

React hooks lint here is strict: `react-hooks/set-state-in-effect` fires on ANY
synchronous `setState` in a `useEffect` body, even behind an early-return guard.
