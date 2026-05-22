# Frontend Development Mode

This file replaces the old "Dev Mode Changes" note. The frontend now supports both local Katana accounts and Sepolia
Cartridge sessions.

## Devnet

Default mode is `devnet`.

```bash
NEXT_PUBLIC_NETWORK=devnet
NEXT_PUBLIC_RPC_URL=http://localhost:5050
NEXT_PUBLIC_TORII_URL=http://localhost:8080
```

In devnet, `src/app/providers.tsx` uses four hardcoded Katana accounts and exposes them through `useDevAccounts()`. The
UI shows an account dropdown instead of Cartridge connect UI.

`DEVNET_TX_OPTS` skips validation and sets zero resource bounds in direct transaction helpers. This is local-only
behavior.

## Sepolia

Sepolia mode uses Cartridge Controller:

```bash
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia
NEXT_PUBLIC_TORII_URL=https://api.cartridge.gg/x/siege-dojo/torii
```

Set every contract address explicitly for Sepolia. Some fallback addresses in frontend modules are older than the
current manifest.

## Shared Account API

Use `useAccount()` from `src/app/providers.tsx` in application code. It returns:

```ts
{
  account: AccountInterface | undefined;
  address: string | undefined;
  status: "connected" | "disconnected" | "connecting" | "reconnecting";
}
```

Use `useDevAccounts()` only for devnet-only UI.

## Known Local-Dev Caveat

`../scripts/local-dev.sh` starts Katana, migrates contracts, starts Torii, and writes `frontend/.env.local`. The script
still has legacy assumptions:

- It prints a GraphQL Torii URL even though current app reads mostly through SQL and Dojo SDK hooks.
- Its fallback writer grant only includes legacy 2v2 systems.
- It writes only legacy contract env vars.

For modern local world work, verify writer permissions and manifest-derived addresses after migration.
