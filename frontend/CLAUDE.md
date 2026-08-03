# Frontend Notes

Agent context for `frontend/`; supplements the root `CLAUDE.md`.

The frontend supports `devnet`, `katana`, `sepolia`, and `mainnet` modes through `src/app/providers.tsx` (`NEXT_PUBLIC_NETWORK`).

- Devnet uses local Katana accounts.
- Every other mode (katana, sepolia, mainnet) uses Cartridge Controller and `SESSION_POLICIES`.
- Session policies are fixed when the player connects. After adding policies, tell players to reconnect.
- The world UI renders `HexGrid`.
- gRPC subscriptions are the default read path. Do not add new GraphQL queries,
  and do not add a new SQL poller without a reason the read cannot be a
  subscription — see "Reads" below.
- Torii stores u64 key columns (e.g. `match_id`) as zero-padded hex text; use `sqlU64()` from `toriiSql.ts` for comparisons.
- Endpoints (`TORII_URL`, `RPC_URL`) come from `src/lib/network.ts`, never `process.env` directly — the `NEXT_PUBLIC_*_URL` vars are optional per-deployment pins, ignored after a network switch.

## Reads

Two subscription entry points, each opened once by the page that needs it:
`useMatchState1v1` (match page) and `useWorldSubscription` (/world). Every other
hook is a pure `useModels` + `useMemo` selector over the global Dojo store those
populate. A selector called on a page that has not opened the matching
subscription silently returns empty data.

A stream cannot retract a row displaced from a top-N window, so
ranked/windowed views subscribe with a member clause and re-derive the
window client-side. `useActiveBattles` selects over the
`status Eq 'Active'` subscription (opened in `useWorldSubscription`),
then filters, sorts, and slices in the selector. This needs torii >= 1.8.12/1.8.15 (deployed:
1.8.16), where clause matching considers both old and new entity state so a
match leaving the clause is still broadcast. Only do this for sets that stay
small (concurrent active matches); for unbounded history (a leaderboard over
all matches ever) poll a one-shot gRPC `RetrieveEntities` with member clause +
`order_by` + `limit` instead. Torii SQL remains for one-shot reads after a tx
(`fetchConquestOutcome`, the match page's post-tx poll). `usePoll` skips ticks
while the tab is hidden and catches up on re-show.

Stream lifetime is bounded by infrastructure, not the app (measured
2026-07-26): Railway's edge (hikari) kills an idle streaming response at
exactly 300s — h2 gets RST_STREAM(CANCEL), h1 sockets are terminated —
regardless of torii's h2 PING keepalives, which don't traverse the edge.
`@dojoengine/grpc` auto-resubscribes but replays only the last already-seen
message; events emitted while a stream was down are lost until the entity
next changes. Mitigation in place: every subscription entry point pairs a
`useVisibilityReseed` (re-run the seed fetch when the tab becomes visible —
event-driven, zero steady-state).

Changing a subscription query on a live hook works at the transport level
but skips the reseed. SDK 1.9.0 routes subscriptions through the pure-TS
`@dojoengine/grpc` client, whose `updateEntitySubscription` re-keys a live
stream cleanly (verified against katana torii 1.8.16 on 2026-07-27 —
repeated re-keys accepted, stream stays up; the old torii-wasm "expected
instance of V" failure no longer applies). However `useEntityQuery`'s
update path sends only the new clause and never re-runs the seed fetch, so
a re-keyed subscription starts with no snapshot for the new key — entities
appear only as they next change on-chain.

To key a query on the wallet address, remount the hook on address change
(fresh mount = full seed + subscribe) rather than mutating the query in
place; the wildcard-clause + client-side-filter pattern also remains valid.

A truly dead stream in a visible tab still shows as stale data
(useToriiHealth is SQL-fed only) — accepted; the durable fix is an
application-level heartbeat in torii's subscription streams, which is an
upstream ask.

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

Use `BigInt(0)` rather than `0n` in frontend code — `tsconfig.json` targets
ES2017, and TypeScript rejects BigInt literals below ES2020.

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
