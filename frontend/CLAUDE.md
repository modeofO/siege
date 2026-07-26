# Frontend Notes

The frontend supports `devnet`, `katana`, `sepolia`, and `mainnet` modes through `src/app/providers.tsx` (`NEXT_PUBLIC_NETWORK`).

- Devnet uses local Katana accounts.
- Sepolia and mainnet use Cartridge Controller and `SESSION_POLICIES`.
- Session policies are fixed when the player connects. After adding policies, tell players to reconnect.
- The world UI renders `HexGrid`.
- Torii SQL is the default polling read path. Do not add new GraphQL queries.
- Torii stores u64 key columns (e.g. `match_id`) as zero-padded hex text; use `sqlU64()` from `toriiSql.ts` for comparisons.
- `NEXT_PUBLIC_TORII_URL` is required — `toriiSql.ts` defaults to localhost otherwise.

Use `BigInt(0)` rather than `0n` in frontend code.

`src/bindings/typescript/*.gen.ts` are generated — don't hand-edit them.

React hooks lint here is strict: `react-hooks/set-state-in-effect` fires on ANY
synchronous `setState` in a `useEffect` body, even behind an early-return guard.
