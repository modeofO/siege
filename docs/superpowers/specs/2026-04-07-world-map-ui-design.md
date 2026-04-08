# World Map UI

A new `/world` page showing a hex grid map of all parcels, colored by type and ownership. Includes a registration flow for new players.

## Page: /world

Full-page hex grid map. If the player isn't registered, a registration overlay appears.

## Hex Grid (SVG)

- Each parcel is a flat-top hexagon SVG polygon
- Even-row offset coordinates (matches the contract's hex system)
- Color by parcel type:
  - Forge: warm copper (#b87333)
  - Quarry: cool grey (#8a8a9a)
  - Grove: forest green (#4a7c59)
- Ownership rendering:
  - **Your parcels**: gold border (#daa520), subtle glow
  - **Other player's parcels**: red-tinted border (#c44332)
  - **Unclaimed**: dim border (#3d3428), slightly transparent fill
  - **Home parcels**: distinct marker inside the hex (small shield or crown icon, or a filled inner hex)
- Hover: tooltip with parcel type name, owner address (truncated), coordinates
- Click: selected hex highlights with brighter border (no action yet — future conquest)
- The grid auto-centers on the player's home parcels if registered

## Registration Flow

- Shown when player has no `PlayerKingdom` on-chain (not registered)
- Modal/overlay: "CLAIM YOUR KINGDOM"
- 3 selectors for home parcel types, each choosing Forge / Quarry / Grove
- Same card style as node contest cards (dark panel, resource icons, type name)
- Submit button: calls `world_system.register_player([type0, type1, type2])`
- After success: overlay dismisses, map refreshes with new home parcels highlighted

## Kingdom Summary Panel

- Shown below or beside the map when player is registered
- Displays:
  - Total parcel count
  - Home parcel types (3 icons)
  - Ability inventory counts (from fetchAbilityBalances)
- Compact — doesn't dominate the map view

## Data Hooks

- `useWorldParcels()`: fetch all Parcel models from Torii, poll every 4s
- `usePlayerKingdom(playerAddress)`: fetch PlayerKingdom for current player
- Both follow the same polling pattern as `useMatchState1v1`

## Files

- Create: `frontend/src/app/world/page.tsx`
- Create: `frontend/src/components/HexGrid.tsx`
- Create: `frontend/src/components/RegisterKingdom.tsx`
- Create: `frontend/src/lib/worldState.ts`
- Modify: `frontend/src/components/Navbar.tsx` — add WORLD link

## Visual Style

- Same medieval color palette as rest of app (dark backgrounds, gold accents, serif headers)
- SVG sits in a dark panel matching the battlefield/deploy orders style
- Registration modal uses the same panel-medieval styling
- Responsive: map scales to fit viewport, parcels resize proportionally

## What This Does NOT Include

- Conquest initiation (clicking to attack)
- Preset defense management
- Resource drip claiming
- Staked match creation from world view
- Pan/zoom controls (add later when grid grows beyond 10 parcels)
