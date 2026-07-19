# Crafting Station V5 — Complete Analysis (2026-07-20)

## Project Structure
```
crafting_station_V5/
├── dev/
│   ├── .includes              # Build order
│   ├── header.js               # Global imports
│   ├── debug.js                # Logging utils
│   ├── commands.js             # Empty
│   ├── other.js                # Empty
│   ├── translate.js            # Translations
│   ├── blocks/
│   │   ├── ChestTransferLogic.js          # Drag-drop + animations (574 lines)
│   │   ├── craftingStationChestsWindow.js # Chest scanning + slot creation (217 lines)
│   │   ├── craftingStationRecipeWindow.js # Recipe list (238 lines)
│   │   └── craftingStation.js             # Main block + UI + TE (1139 lines)
│   └── shared.js               # Empty
├── lib/                        # StorageInterface, VanillaSlots, CustomWindows
├── gui/                        # UI textures
├── res/terrain-atlas/          # Block textures
├── typings/                    # TS declarations (core-engine.d.ts)
├── config.json
├── build.config
├── mod.info
├── launcher.js
└── AGENTS.md                   # Deleted from git but recreated locally
```

## Build Order (from .includes)
1. header.js
2. debug.js
3. commands.js
4. other.js
5. translate.js
6. blocks/ChestTransferLogic.js
7. blocks/craftingStationChestsWindow.js
8. blocks/craftingStationRecipeWindow.js
9. blocks/craftingStation.js
10. shared.js

---

## USER'S CURRENT COMPLAINTS (Session End, 2026-07-20)

### 1. Recipe List Layout — CRITICAL
- Recipe slots are TINY no matter what pixel size I set
- Recipe window (240px) shows only ~1/9 of the dedicated space
- 3 columns of 72px each = only first row visible, rest not scrolling properly
- Scroll does NOT work despite setScroll + IsDynamic: true
- The window height seems wrong — content doesn't fill the window

**Real cause UNKNOWN.** Changing recipeSlotSize from 56→72→80→148px makes NO visible difference. The rendering ignores the size parameter. Possible causes:
- `IsDynamic: true` interferes with rendering
- Scroll/position calculations are wrong
- Window height (screenHeight-45) != actual rendered height
- `forceRefresh()` after setScroll resets the scroll position

### 2. Auto-Fill / Fill Button
- Called `autoFillGrid`, dispatched from button clicker
- Server-side handler: `Recipes.getRecipeByField(container, "")`
- Log shows: `need=undefined` for all entries (FIXED in last commit: `entry.count || 1`)
- Even with need fixed, 0 items moved because chest search finds nothing
- The handler searches chests via StorageInterface, then player inventory
- Log shows chest slots ARE found but nothing matches

**UNCONFIRMED if fix works** — user hasn't tested after last commit.

### 3. Item Disappears When Moving to Grid
- Moving an item from inventory to a grid slot that already has items
- If the slot has DIFFERENT items (e.g., move dark wood to slot with oak), the dark wood vanishes
- Transfer policy was returning 0 because `maxStack - currentCount = 0`
- **FIXED in last commit**: transfer policy now allows FULL count when items differ (SWAP detection)

**UNCONFIRMED if fix works** — user hasn't tested.

### 4. Inventory Too Low / Too Much Space
- Grid window takes too much vertical space
- Inventory starts too far down (y = 40 + gridAreaHeight)
- gridAreaHeight = buttonY + buttonH + 10 ≈ 350-370px
- With screenHeight = 450, inventory starts at y ≈ 390-410 → barely visible
- Gap between sections is uneven (some 0px, some huge)
- Chest window has visible gap below, inventory doesn't

### 5. Chest → Grid: Item Loss (from earlier logs)
- Log showed `count=-64` in chest when moving chest→grid
- CAUSE: `slot1` Java reference mutated by `container.setSlot()` → `slot1.count` changed from 64 to 0 → `0 - 64 = -64`
- **FIXED** in earlier commit: slot values saved to local vars before setSlot

### 6. Grid → Chest: Count Issues
- When moving grid→chest via dedicated handler `gridToChest`, the count calculation uses `slot2_count` which might have been mutated

### 7. Recipe List — Deduplication & Wood Types
- Multiple recipes with same result (e.g., crafting table from different wood) all show up
- **PARTLY FIXED**: dedup by result.id + result.data
- Wood type data=-1 (any wood) defaults to data=0 (oak) when no actual items found
- **FIXED in last commit**: tracks `actualData` from first item found in chests/inventory

---

## Architecture Overview

### UI Layout — Current State (commit 5437c8d)
```
Screen: 1000 x 450 (from logs)
Recipe:  x=5,   y=40,  w=240, h=405, IsDynamic=true
Grid:    x=250, y=40,  w=440, h=gridAreaHeight (≈350, FULL content, no cap)
Result:  x=330, y=?,   size=82
Inv:     x=250, y=40+gridAreaHeight, w=440, h=rest, scroll×2
Chest:   x=695, y=40,  w=300, h=405, IsDynamic=true
BG:      x=0,   y=0,   w=1000,h=450
```

### Window Group Order (affects z-ordering)
1. craftingStationGui_background
2. recipeWindow
3. craftingGridWindow
4. inventoryWindow
5. chestsWindow

### Key Functions

#### craftingStation.js
- `CraftingGridElements()` — creates 9 slotGrid0-8 elements
- `refillGridFromChests(container, recipe, playerUid)` — server-side, pulls items from chests+inv to fill grid
- `recipeMatchesGrid(container, recipe)` — checks if grid matches recipe
- `updateResultSlot(container)` — calls `Recipes.getRecipeResult(container, "")` and sets slotResult
- `returnGridToInventory(container, playerUid)` — server-side, returns grid items to player
- `testRecipeAPI(container)` — logs all Recipes API methods

#### craftingStationRecipeWindow.js
- `setupRecipeWindow(recipeWin)` — creates recipeSlot0-29 elements, sets scroll
- `getAllWorkbenchRecipes()` — Java Collection → JS array via iterator (1718 items)
- `refreshRecipeList(container, playerUid)` — background thread: dedup, check craftable, set slots, darken
- `isRecipeCraftable(recipe, container, playerUid)` — checks if ALL ingredients are available
- `countAvailableItem(itemId, itemData, container, playerUid)` — counts from grid + inv (via PlayerActor) + chest (via sideInfo)
- `onRecipeSlotClick(index, container)` — sends `selectRecipe` event to server

#### craftingStationChestsWindow.js
- `infoAllSides(blockSource, x, y, z)` — scans 6 sides for StorageInterface containers
- `clearEverything(container, window)` — clears chest slots, preserves grid slots
- `setChestsSlotsAllSides(blockSource, container, x, y, z)` — copies chest items to container
- `verifyChestsSlotsAllSides(...)` — checks for changes every 5 ticks
- `parseSlot(str)` — extracts side+slot from "sideXslotY"

#### ChestTransferLogic.js
- `registerForWindow(window, container, options)` — adds drag-drop handlers to all windows
- `isGridSlot(name)` — checks if name starts with "slotGrid"
- `slotOnTouchEvent(element, event)` — handles touch, dispatches grid or non-grid events
- `startAnim(...)` — animation overlay for item transfers

### Container Events (all server-side)
| Event | Direction | Handler Location |
|-------|-----------|------------------|
| SlotToSlot | chest⇄chest | craftingStation.js |
| InventorySlotToSlot | inv⇄inv | craftingStation.js |
| SlotToInventorySlot | chest→inv | craftingStation.js |
| InventorySlotToContainerSlot | inv→chest | craftingStation.js |
| gridToGrid | grid⇄grid | craftingStation.js |
| gridToChest | grid→chest | craftingStation.js |
| chestToGrid | chest→grid | craftingStation.js |
| gridToInventory | grid→inv | craftingStation.js |
| inventoryToGrid | inv→grid | craftingStation.js |
| craftOnce | result tap (1) | craftingStation.js |
| craftStack | result long tap | craftingStation.js |
| craftAll | button | craftingStation.js |
| clearGrid | button | craftingStation.js |
| autoFillGrid | button | craftingStation.js |
| selectRecipe | recipe slot click | craftingStation.js |

---

## Recipes API — Known Working Methods

### CONFIRMED WORKING (from log tests)
```js
Recipes.getAllWorkbenchRecipes()              // → Java Collection, 1718 items
Recipes.getRecipeResult(container, "")         // → ItemInstance, works when grid has valid recipe
Recipes.getRecipeByField(container, "")        // → WorkbenchRecipe, works when grid has valid recipe
Recipes.provideRecipeForPlayer(container, "", -1)  // → ItemInstance, crafts and consumes ingredients
Recipes.getWorkbenchRecipesByIngredient(5, 0)  // → Java Collection, 37 recipes using planks
```

### RecipeEntry Properties (from Java, accessible as JS properties)
```js
entry.id        // ✓ works (NOT entry.getId())
entry.data      // ✓ works (NOT entry.getData())
entry.count     // ✗ UNDEFINED! Need .count || 1 fallback
```

### Java WRAP_JAVA Classes (found in Refined Storage, NOT tested)
```js
const WorkbenchRecipes = WRAP_JAVA('com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchRecipeRegistry');
const WorkbenchFieldAPI = WRAP_JAVA('com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchFieldAPI');
```

---

## Current Bugs (UNCONFIRMED if latest commit fixes them)

### Bug A: Scroll in Recipe Window
- `setScroll(0, value)` called in setupRecipeWindow and again in refreshRecipeList thread
- Scroll does NOT work — only first ~3 rows visible
- Need to investigate: IsDynamic + setScroll interaction, or forceRefresh resetting scroll

### Bug B: Items Vanish on SWAP Conflict
- Moving item into occupied grid slot with different item → source item vanishes
- Transfer policy was blocking SWAP (returning 0)
- **FIX ATTEMPTED**: Policy now allows full count when items differ
- But policy check happens BEFORE the SWAP in SlotToSlot handler

### Bug C: Recipe Window Height / Slots Tiny
- Setting recipeSlotSize to 56, 72, 80, or 148 makes NO visible difference
- Slots are always rendered at the same tiny size
- Possible causes:
  1. Window height calculation wrong → content not filling window
  2. `IsDynamic: true` overrides element sizes
  3. Inner Core slot rendering uses a different unit than expected
  4. `forceRefresh()` resets element dimensions

### Bug D: Auto-Fill / Fill Button Returns 0
- `Recipes.getRecipeByField(container, "")` returns null when grid has partial items
- When it DOES find a recipe (id=58, crafting table), `entry.count` is undefined
- `need=undefined → missing=NaN → taken stays 0`
- **FIX ATTEMPTED**: `entry.count || 1`

---

## Refined Storage Patterns (Can Be Used)

From `/home/gicu/Downloads/Refined Storage/dev/`:

1. **Recipe list shows result items** (not ingredients) — crafting_grid.js:128
2. **Darken unavailable recipes** — `element.darken = true` — crafting_grid.js:129
3. **Thread for task processing** — `java.lang.Thread({run:...})` + `MIN_PRIORITY` — crafting_grid.js:1016-1027
4. **UI update on main thread** — `UI.getContext().runOnUiThread(...)` — crafting_grid.js:83-91
5. **`javaRecipe.getEntryCollection().iterator()`** — alternative to getSortedEntries — crafting_grid.js:631
6. **`javaRecipe.provideRecipeForPlayer(container, player)`** — crafting takes player entity — crafting_grid.js:770
7. **`javaRecipe.getRecipeUid()`** + **`Recipes.getRecipeByUid(uid)`** — store/restore recipe — crafting_grid.js:707,1074
8. **`container.asScriptableField()`** — remaining items after craft — crafting_grid.js:773
9. **`ScriptableObjectHelper.createArray(javaArray)`** — Java→JS array — header.js:5
10. **`searchItem(id, data, extra, list, reverse, playerUid)`** — inventory search utility — other.js:33
11. **`getItemUid(item)`** — unique ID: `id_data_extraValue` — other.js:494
12. **`container.setSlotSavingEnabled(name, false)`** — prevent slot saving for grid — header.js:617

---

## Logging System

### Log Tags
| Tag | When |
|-----|------|
| `debugLog` | General | 
| `debugLog_event` | Container events, transfers |
| `debugLog_ui` | UI setup, layout |
| `debugLog_chest` | Chest scanning |
| `debugLog_anim` | Animations |
| `chatLog` | In-game chat (dev mode) |

### Added Recently
- `Dispatching eventName src= dst= val=` — in ChestTransferLogic.js slotOnTouchEvent
- `gridToChest/chestToGrid/etc: player= slot= value=` — at start of each grid handler
- `SWAP chestX[side:slot] before/after:` — detailed chest state in SlotToSlot SWAP
- `updateResultSlot: found/no recipe` — result slot status
- `getAllWorkbenchRecipes: N recipes loaded` — collection conversion
- `refreshRecipeList: N shown, M darkened, scroll=S` — recipe list update

### Missing Logs (for debugging remaining bugs)
- In `refreshRecipeList`: the calculated totalHeight and scroll value before/after setScroll
- In `autoFillGrid`: which chests are searched, what StorageInterface returns
- In `slotOnTouchEvent`: when `isGridSlot()` returns true/false for a given slot
- In transfer policy: when it returns limited vs full count

---

## Key Files to Read for Next Session

1. `craftingStation.js` — main block, TE, UI windows, container events (1139 lines)
2. `craftingStationRecipeWindow.js` — recipe list (238 lines)
3. `craftingStationChestsWindow.js` — chest scanning (217 lines)
4. `ChestTransferLogic.js` — drag-drop, event dispatch (574 lines)
5. `core-engine.d.ts` — API typings (23227 lines)
   - `Recipes` namespace: line 13838
   - `ItemContainer` (WorkbenchField): line 8279
   - `WorkbenchUIHandler`: line 14070
   - `WorkbenchRecipe`: line 14127
6. `COMPLETE_ANALYSIS.md` — this file

---

## GIT History (chronological, newest first)
```
5437c8d — Fix auto-fill entry.count||1, transfer policy SWAP, grid full height
e746953 — Restore layout: recipe 240px 4x56px, grid 440px 95px, chest 300px
fd38fe7 — Recipe 4x80px, grid 85px/360px, inv moved up+double scroll, detailed chest swap logging
058c4b9 — Recipe list: 2 cols 148px, dedup results, fix wood type data
5af65b2 — Fix duplication: selectRecipe server-side, thread safety, scroll re-apply
aebd27f — RefinedStorage recipe pattern: show ALL results, darken, thread processing
626ad92 — Fix recipe window: IsDynamic=true, elements predefined, clicker uses container
1f08ae2 — Fix RecipeEntry: use .id/.data/.count not .getId()/.getData()/.getCount()
253eceb — Fix recipe list: pass playerUid, use PlayerActor not Player.get()
6eddc7a — Fix slots: recipe 3x72px, inv 167px/6per row, grid 50% cap
c24a663 — Fix recipe list: getAllWorkbenchRecipes returns 1718 recipes
7f9d47f — Layout redesign: recipe 2x80px, grid 95px centered, inv 7/row 60px
b19d09c — Fix gridWindowHeight ref, Java Collection .size() vs .length
700fcd0 — V5: grid transfers, dedicated handlers, fix item loss, persistence, layout
2db47fa — Delete AGENTS.md
ee0f1ab — Initial commit
```

---

## Bugs Fixed (Confirmed Working)

- ✅ Item loss chest→grid (slot1 mutation) — save to local var before setSlot
- ✅ slot2.name = undefined — separate name read from asScriptable
- ✅ Java Collection .length → .size() — getAllWorkbenchRecipes
- ✅ RecipeEntry .getId() → .id — property vs method access
- ✅ Player.get() → PlayerActor(playerUid) — server-side inventory check
- ✅ selectRecipe server-side — prevents client-side item duplication
- ✅ Thread safety — container ops in runOnUiThread, not in background thread
- ✅ Wood type (data=-1) — tracks actualData from first found item
- ✅ Deduplicate recipes by result.id+data
- ✅ Grid persistence on close/exit — clearEverything preserves slotGrid* 
- ✅ Scroll re-applied after content update
- ✅ Transfer policy for same-item stacking
- ✅ entry.count || 1 fallback

## Remaining Issues (UNCONFIRMED / UNFIXED)

- ❌ Recipe window scroll NOT working — only first row visible
- ❌ Auto-Fill returns 0 items moved (even after entry.count fix, need to test)
- ❌ Items vanish on SWAP to occupied grid slot (transfer policy fix needs testing)
- ❌ Inventory too low
- ❌ Uneven gaps between UI sections
- ❌ Recipe slots rendered too small regardless of size parameter
