# Crafting Station — Inner Core / Horizon Mod

## Project Overview
Port of Tinkers Construct's Crafting Station for Minecraft Bedrock (Inner Core / Horizon engine). The block scans adjacent containers (chests, barrels, etc.) and displays their contents as virtual slots in a custom UI, allowing drag-and-drop item transfers.

## Tech Stack
- **Language:** JavaScript (ES6)
- **Engine:** Inner Core / Horizon (CoreEngine API)
- **Build System:** Inner Core Mod Toolchain — compiles `dev/` → `main.js` via `.includes` order
- **Libraries:** StorageInterface (shared lib, in `lib/`)

## Project Structure
```
crafting_station_V4/
├── dev/                     # Source code (pre-compile)
│   ├── .includes            # Build order (files concatenated in this order)
│   ├── header.js            # Global IMPORTs
│   ├── debug.js             # Logging utils (chatLog, debugLog)
│   ├── translate.js         # Translation strings
│   ├── blocks/
│   │   ├── ChestTransferLogic.js      # Drag-and-drop with animations
│   │   ├── craftingStationChestsWindow.js  # Chest scanning & slot creation
│   │   └── craftingStation.js         # Main block definition, UI, TileEntity
│   └── (shared.js, commands.js, other.js)  # Placeholder files, may be empty
├── lib/                     # Libraries (StorageInterface, VanillaSlots, CustomWindows)
├── gui/                     # UI texture assets (PNGs)
├── res/terrain-atlas/       # Block texture atlas (PNGs)
├── typings/                 # TypeScript declarations for IntelliSense
│   ├── core-engine.d.ts
│   └── android.d.ts
├── config.json              # Runtime config: enabled, dev (debug mode)
├── build.config             # Build system configuration
├── mod.info                 # Mod metadata
├── launcher.js              # Entry point (ConfigureMultiplayer + Launch)
├── jsconfig.json            # VS Code JS IntelliSense config
└── .vscode/settings.json    # VS Code workspace settings
```

## Code Conventions
- **Variables:** `var` (Inner Core engine uses ES5 style; avoid `let`/`const` for consistency with engine globals)
- **APIs:** Global namespaces (`Item.*`, `Block.*`, `Recipes.*`, `Callback.*`, `TileEntity.*`, `UI.*`, `IDRegistry.*`)
- **IDs:** Block/item IDs via string nameID, runtime constants `BlockID.*` / `ItemID.*`
- **Logging:** Use `chatLog(msg)` for in-game chat messages (dev mode only), `debugLog(msg)` for Logger (Inner Core's logging system). `console.log` does NOT exist in Inner Core — use `Logger.Log(msg, tag)` instead.
- **UI:** Windows defined as `new UI.Window({...})`, grouped via `new UI.WindowGroup()`
- **TileEntity:** Prototype object with `defaultValues`, `click`, `tick`, `init`, `destroy`, `containerEvents`, `getScreenName`/`getScreenByName`

## Debug Mode
Set `"dev": true` in `config.json` to enable in-game chat logging (`chatLog`) and console debug output (`debugLog`).

## Build
The build system concatenates files in `.includes` order and compiles to `main.js`. Run via Inner Core Mod Toolchain or Horizon IDE.

## Multiplayer Architecture (Inner Core)
- Code must be split: **server** handles world logic, **client** handles visuals/UI
- Client CANNOT access server vars/functions and vice versa (except via network packets)
- **`useNetworkItemContainer: true`** on TileEntity prototype enables multiplayer container
- Server TileEntity fields: `this.x/y/z`, `this.data`, `this.container` (ItemContainer), `this.blockSource`, `this.networkData`, `this.networkEntity`
- Client TileEntity (via `client: { load, unload, tick, events: {}, containerEvents: {} }`): **NO `this.container`**, NO `this.blockSource` — only `this.networkData`
- Use **`BlockSource`** for all world ops, NOT global `World` module
- Use **`PlayerActor`** for player access (`new PlayerActor(playerUid)`), NOT global `Player` module
- `getScreenName` runs on **server**, `getScreenByName` runs on **client**
- `ServerPlayerTick` for per-player server tick; `LocalTick` for client-side only
- ID conversion: `Network.serverToLocalId(id)` and `Network.localToServerId(id)`
- **Do NOT use both `containerEvents` on prototype AND `addServerEventListener` for the same events** — causes double processing
- Source: `Адаптация модов для сетевой игры.md` (Inner Core official multiplayer adaptation guide)

## Key APIs Used
- `IMPORT("StorageInterface")` — container interface for adjacent blocks
- `TileEntity.registerPrototype` — custom block logic
- `UI.WindowGroup` + `UI.Window` — custom GUI
- `StorageInterface.getNeighbourStorage` — scan adjacent containers
- `BlockRenderer` / `ICRender.Model` — custom 3D block model
- `Recipes.addShaped` — crafting recipe
