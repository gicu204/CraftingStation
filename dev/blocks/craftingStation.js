IMPORT('StorageInterface');

var BLOCK_TYPE_WOOD = Block.createSpecialType({ base: 5 });

IDRegistry.genBlockID("craftingStationBlock");
var bid = BlockID.craftingStationBlock;
chatLog("Block ID generated: " + bid);

Block.createBlock("craftingStationBlock", [
    {
        name: "Crafting Station", 
        texture: [["plank_oak", 0], ["crafting_station_top", 0], ["crafting_station_side", 0]],
        inCreative: true
    }
], BLOCK_TYPE_WOOD);
debugLog("Block created: craftingStationBlock (ID=" + bid + ")");

Block.registerDropFunction("craftingStationBlock", function(coords, blockID, blockData, diggingLevel, enchant, item, region) {
    debugLog_chest("Block broken at " + coords.x + "," + coords.y + "," + coords.z + " — dropping block itself");
    return [[BlockID.craftingStationBlock, 1, 0]];
});

Recipes.addShaped({
    id: BlockID.craftingStationBlock,
    count: 1,
    data: 0
}, [
    "#"
], ['#', 58, 0]);
debugLog("Recipe registered: craftingStationBlock = crafting table");

var craftingStationModel = BlockRenderer.createModel();
craftingStationModel.addBox(0, 12/16, 0, 1, 1, 1, BlockID.craftingStationBlock, 0);   
craftingStationModel.addBox(0, 0, 0, 4/16, 12/16, 4/16, BlockID.craftingStationBlock, 0);  
craftingStationModel.addBox(0, 0, 12/16, 4/16, 12/16, 1, BlockID.craftingStationBlock, 0);  
craftingStationModel.addBox(12/16, 0, 0, 1, 12/16, 4/16, BlockID.craftingStationBlock, 0); 
craftingStationModel.addBox(12/16, 0, 12/16, 1, 12/16, 1, BlockID.craftingStationBlock, 0);  
var craftingStationRender = new ICRender.Model();
craftingStationRender.addEntry(craftingStationModel);
BlockRenderer.setStaticICRender(BlockID.craftingStationBlock, -1, craftingStationRender);

debugLog("Custom block model set");

var craftingStationGui_background = new UI.Window({
    location: {
        x: 0,
        y: 0,
        width: 1000,
        height: screenHeight
    },
    drawing: [
        { type: "background", color: android.graphics.Color.parseColor("#d9d9d9")}
    ],
    elements: {
        "closeButton": { type: "closeButton", x: 915, y: 0, bitmap: "close_button_icon", scale: 2 }
    }
});
debugLog_ui("Background window created");

// Recipe list panel (left side)
var recipeWindow = new UI.Window({
    location: {
        x: 5,
        y: 40,
        width: 320,
        height: screenHeight - 45,
    },
    drawing: [
        { type: "background", color: android.graphics.Color.parseColor("#4a4a5a") }
    ],
    elements: recipeWindowElements,
    IsDynamic: true,
});
debugLog_ui("Recipe window created (IsDynamic=true)");
setupRecipeWindow(recipeWindow);

// Crafting grid panel (center-top) — 3x3 grid + result + buttons
var craftSlotSize = 95;
var craftPad = 7;
var craftGridStartX = 15;
var craftGridStartY = 6;

function CraftingGridElements() {
    var el = {};
    for (var i = 0; i < 9; i++) {
        var col = i % 3;
        var row = Math.floor(i / 3);
        el["slotGrid" + i] = {
            type: "slot",
            x: craftGridStartX + col * (craftSlotSize + craftPad),
            y: craftGridStartY + row * (craftSlotSize + craftPad),
            size: craftSlotSize,
        };
    }
    return el;
}

var craftingGridElements = CraftingGridElements();

// Result slot (right of grid, clickable — tap=1, long=stack)
var resultSlotSize = 82;
craftingGridElements["slotResult"] = {
    type: "slot",
    x: 330,
    y: craftGridStartY + (3 * (craftSlotSize + craftPad) - resultSlotSize) / 2,
    size: resultSlotSize,
    clicker: {
        onClick: function(container2, window, element) {
            debugLog("Result slot tapped — craft 1");
            var c = container2 && container2.getParent ? container2.getParent() : container2;
            c.sendEvent("craftOnce", {});
        },
        onLongClick: function(container2, window, element) {
            debugLog("Result slot long tapped — craft 1 stack");
            var c = container2 && container2.getParent ? container2.getParent() : container2;
            c.sendEvent("craftStack", {});
        }
    }
};

// Craft logic — all handled server-side via containerEvents

// Server-side: fill grid from chests (called from containerEvents handlers)
function refillGridFromChests(container, recipe, playerUid) {
    try {
        var entries = recipe.getSortedEntries();
        var anyRefilled = false;
        for (var i = 0; i < 9; i++) {
            var entry = entries[i];
            if (!entry || entry.id <= 0) continue;
            var gridSlot = container.getSlot("slotGrid" + i);
            var need = entry.count;
            var have = gridSlot ? gridSlot.count : 0;
            var missing = need - have;
            if (missing <= 0) continue;

            debugLog_event("  refill slotGrid" + i + ": need=" + need + " have=" + have + " missing=" + missing + " item=" + entry.id);

            // Pull from player inventory first
            if (playerUid) {
                try {
                    var player = new PlayerActor(playerUid);
                    for (var pi = 0; pi < 36 && missing > 0; pi++) {
                        var invSlot = player.getInventorySlot(pi);
                        if (invSlot && invSlot.id == entry.id && (invSlot.data == entry.data || entry.data == -1) && invSlot.count > 0) {
                            var take = Math.min(invSlot.count, missing);
                            player.setInventorySlot(pi, invSlot.id, invSlot.count - take, invSlot.data, invSlot.extra);
                            missing -= take;
                            have += take;
                            debugLog_event("    pulled " + take + " from inv slot " + pi + " (remaining=" + missing + ")");
                        }
                    }
                } catch (e) {}
            }
            if (have > 0) {
                container.setSlot("slotGrid" + i, entry.id, have, entry.data > -1 ? entry.data : 0);
                anyRefilled = true;
            }
        }
        return recipeMatchesGrid(container, recipe) || anyRefilled;
    } catch (e) { debugLog("refillGridFromChests error: " + e); return false; }
}

// Server-side: check if grid matches recipe
function recipeMatchesGrid(container, recipe) {
    try {
        var entries = recipe.getSortedEntries();
        for (var i = 0; i < 9; i++) {
            var entry = entries[i];
            var slot = container.getSlot("slotGrid" + i);
            if (entry && entry.id > 0) {
                if (!slot || slot.id != entry.id || slot.count < entry.count) return false;
            } else {
                if (slot && slot.id > 0) return false;
            }
        }
        return true;
    } catch (e) { return false; }
}

// Server-side: return grid items to player inventory
function returnGridToInventory(container, playerUid) {
    try {
        var player = new PlayerActor(playerUid);
        if (!player) return;
        for (var i = 0; i < 9; i++) {
            var slot = container.getSlot("slotGrid" + i);
            if (slot && slot.count > 0) {
                player.addItemToInventory(slot.id, slot.count, slot.data, slot.extra || null, true);
                container.setSlot("slotGrid" + i, 0, 0, 0);
            }
        }
    } catch (e) { debugLog("returnGridToInventory error: " + e); }
}

// Updates the result slot to show current recipe preview
function updateResultSlot(container) {
    var result = Recipes.getRecipeResult(container, "");
    if (result) {
        container.setSlot("slotResult", result.id, result.count, result.data, result.extra || null);
        debugLog_event("updateResultSlot: found recipe result id=" + result.id + " count=" + result.count);
    } else {
        container.setSlot("slotResult", 0, 0, 0, null);
        debugLog_event("updateResultSlot: no recipe");
    }
    container.sendChanges();
    if (craftingStationGui.isOpened()) {
        craftingGridWindow.forceRefresh();
    }
}

// Buttons below the grid
var buttonY = craftGridStartY + 3 * (craftSlotSize + craftPad) + 6;
var buttonW = 100;
var buttonH = 28;

// Helper: get container from clicker params
function _ct(container2) { return container2 && container2.getParent ? container2.getParent() : container2; }

// Test all available Recipes API methods (for debugging)
function testRecipeAPI(container) {
    debugLog("=== Recipes API Test ===");
    try {
        var result = Recipes.getRecipeResult(container);
        debugLog("  getRecipeResult(container) -> " + (result ? "id=" + result.id + " count=" + result.count : "null"));
    } catch (e) { debugLog("  getRecipeResult error: " + e); }
    try {
        var result2 = Recipes.getRecipeResult(container, "");
        debugLog("  getRecipeResult(container, '') -> " + (result2 ? "id=" + result2.id + " count=" + result2.count : "null"));
    } catch (e) { debugLog("  getRecipeResult(container, '') error: " + e); }
    try {
        var field = Recipes.getRecipeByField(container);
        debugLog("  getRecipeByField(container) -> " + (field ? "valid" : "null"));
    } catch (e) { debugLog("  getRecipeByField(container) error: " + e); }
    try {
        var field2 = Recipes.getRecipeByField(container, "");
        debugLog("  getRecipeByField(container, '') -> " + (field2 ? "result id=" + field2.getResult().id : "null"));
    } catch (e) { debugLog("  getRecipeByField(container, '') error: " + e); }
    try {
        var field3 = Recipes.getRecipeByField(container, "slotGrid");
        debugLog("  getRecipeByField(container, 'slotGrid') -> " + (field3 ? "result id=" + field3.getResult().id : "null"));
    } catch (e) { debugLog("  getRecipeByField(container, 'slotGrid') error: " + e); }
    try {
        var all = Recipes.getAllWorkbenchRecipes();
        var allSize = all ? (typeof all.size == "function" ? all.size() : all.length) : 0;
        debugLog("  getAllWorkbenchRecipes() -> " + (all ? "found count=" + allSize : "null"));
    } catch (e) { debugLog("  getAllWorkbenchRecipes() error: " + e); }
    try {
        var byResult = Recipes.getWorkbenchRecipesByResult(5, 1, 0);
        debugLog("  getWorkbenchRecipesByResult(5,1,0) -> " + (byResult ? "count=" + (typeof byResult.size == "function" ? byResult.size() : byResult.length) : "null"));
    } catch (e) { debugLog("  getWorkbenchRecipesByResult error: " + e); }
    try {
        var byIng = Recipes.getWorkbenchRecipesByIngredient(5, 0);
        debugLog("  getWorkbenchRecipesByIngredient(5,0) -> " + (byIng ? "count=" + (typeof byIng.size == "function" ? byIng.size() : byIng.length) : "null"));
    } catch (e) { debugLog("  getWorkbenchRecipesByIngredient error: " + e); }
    try {
        var provided = Recipes.provideRecipeForPlayer(container, "", -1);
        debugLog("  provideRecipeForPlayer(container, '', -1) -> " + (provided ? "id=" + provided.id : "null (expected if no recipe)"));
    } catch (e) { debugLog("  provideRecipeForPlayer error: " + e); }
    debugLog("=== End Recipes API Test ===");
}

// "Craft All" button
craftingGridElements["buttonCraftAll"] = {
    type: "button",
    x: 10,
    y: buttonY,
    bitmap: "RS_empty_button",
    bitmap2: "RS_empty_button_pressed",
    scale: 2.5,
    clicker: {
        onClick: function(container2, window, element) {
            debugLog("Craft All button clicked");
            _ct(container2).sendEvent("craftAll", {});
        }
    }
};
craftingGridElements["labelCraftAll"] = {
    type: "text",
    x: 65,
    y: buttonY + 5,
    text: "Craft All",
    font: { color: android.graphics.Color.WHITE, size: 20, shadow: 0.5 }
};

// "Clear" button
craftingGridElements["buttonClear"] = {
    type: "button",
    x: 160,
    y: buttonY,
    bitmap: "RS_empty_button",
    bitmap2: "RS_empty_button_pressed",
    scale: 2.5,
    clicker: {
        onClick: function(container2, window, element) {
            debugLog("Clear button clicked");
            _ct(container2).sendEvent("clearGrid", {});
        }
    }
};
craftingGridElements["labelClear"] = {
    type: "text",
    x: 215,
    y: buttonY + 5,
    text: "Clear",
    font: { color: android.graphics.Color.WHITE, size: 20, shadow: 0.5 }
};

// "Auto-fill" button
craftingGridElements["buttonAutoFill"] = {
    type: "button",
    x: 305,
    y: buttonY,
    bitmap: "RS_empty_button",
    bitmap2: "RS_empty_button_pressed",
    scale: 2.5,
    clicker: {
        onClick: function(container2, window, element) {
            debugLog("Auto-fill button clicked");
            _ct(container2).sendEvent("autoFillGrid", {});
        }
    }
};
craftingGridElements["labelAutoFill"] = {
    type: "text",
    x: 360,
    y: buttonY + 5,
    text: "Fill",
    font: { color: android.graphics.Color.WHITE, size: 20, shadow: 0.5 }
};

var gridAreaHeight = buttonY + buttonH + 10;
var gridWindowCap = Math.min(gridAreaHeight, screenHeight * 0.50);
var gridScrollY = Math.max(0, gridAreaHeight - gridWindowCap);

var craftingGridWindow = new UI.Window({
    location: {
        x: 330,
        y: 40,
        width: 410,
        height: gridWindowCap,
        scrollY: gridScrollY,
    },
    drawing: [
        { type: "background", color: android.graphics.Color.parseColor("#3a3a4a") }
    ],
    elements: craftingGridElements
});
debugLog_ui("Crafting grid window created, height=" + gridWindowCap + " scrollY=" + gridScrollY);

// Player inventory panel (center-bottom) — standard invSlot layout
var invSlotSize = 167;
var invInRow = 6;

function PlayerInventorySlots(offsetY) {
    var elements = {};
    var startX = 0;
    for (var i = 0; i < 36; i++) {
        var x = i % invInRow; 
        var y = Math.floor(i / invInRow);  
        elements["invSlot" + i] = {
            type: "invSlot",  
            x: startX + x * invSlotSize,
            y: offsetY + y * invSlotSize,
            size: invSlotSize,
            index: i,
        };
    }
    return elements;
}

var invOffsetY = 0;
var invElements = PlayerInventorySlots(invOffsetY);
debugLog_ui("Inventory slots created: " + Object.keys(invElements).length);

var inventoryWindow = new UI.Window({
    location: {
        x: 330,
        y: 40 + gridWindowCap + 2,
        width: 410,
        height: screenHeight - (40 + gridWindowCap + 7),
        scrollY: invSlotSize / 2.74 * Math.trunc(36 / invInRow),
    },
    drawing: [
        { type: "background", color: android.graphics.Color.YELLOW }
    ],
    elements: invElements
});
inventoryWindow.setInventoryNeeded(true);
debugLog_ui("Inventory window created, y=" + (40 + gridWindowCap + 2) + " scrollY=" + (invSlotSize / 2.74 * Math.trunc(36 / invInRow)));

// Connected chests panel (right side)
var chestsWindow = new UI.Window({
    location: {
        x: 745,
        y: 40,
        width: 250,
        height: screenHeight - 45,
    },
    drawing: [
        { type: "background", color: android.graphics.Color.RED }
    ],
    elements: chestsWindowElements,
    IsDynamic: true,
});
debugLog_ui("Chests window created (IsDynamic=true)");

var craftingStationGui = new UI.WindowGroup();
craftingStationGui.setCloseOnBackPressed(true); 

craftingStationGui.addWindowInstance("craftingStationGui_background", craftingStationGui_background);
craftingStationGui.addWindowInstance("recipeWindow", recipeWindow);
craftingStationGui.addWindowInstance("craftingGridWindow", craftingGridWindow);
craftingStationGui.addWindowInstance("inventoryWindow", inventoryWindow);
craftingStationGui.addWindowInstance("chestsWindow", chestsWindow);
debugLog_ui("WindowGroup created with 5 windows");

registerForWindow(inventoryWindow, this.container);
registerForWindow(craftingGridWindow, this.container);

TileEntity.registerPrototype(BlockID.craftingStationBlock, {
    defaultValues: {
        tick: 0,
        refresh: false, 
        wasOpened: false,
    },

    useNetworkItemContainer: true,

    getScreenName: function(player, coords) {
        return "master"; 
    },

    getScreenByName: function(screenName) {
        return screenName === "master" ? craftingStationGui : null; 
    },

    click: function (id, count, data, coords, player, extra) {
        debugLog("Tile clicked at " + this.x + "," + this.y + "," + this.z + " by player=" + player);
        debugLog_event("click: refresh=" + this.data.refresh + " wasOpened=" + this.data.wasOpened + " chestData.valid=" + chestData.valid);
        clearEverything(this.container, chestsWindow);
        var onCurrentThread = true;
        chestsWindow.invalidateElements(onCurrentThread);
        chestsWindow.forceRefresh();
        infoAllSides(this.blockSource, this.x, this.y, this.z);
        setChestsSlotsAllSides(this.blockSource, this.container, this.x, this.y, this.z);

        chestsWindow.forceRefresh();

        this.container.setGlobalAddTransferPolicy(function(container, name, id, count, data, extra, time) {
            if (name.indexOf("slotGrid") == 0) {
                return Math.min(count, Item.getMaxStack(id) - container.getSlot(name).count);
            }
            if (name == "slotResult") return 0;
            debugLog_event("TransferPolicy: accepting " + count + " of id=" + id + " into slot '" + name + "'");
            return count;
        });
        this.container.setGlobalGetTransferPolicy(function(container, name, id, amount, data, extra, playerUid) {
            if (name.indexOf("slotGrid") == 0) return amount;
            return amount;
        });
        
        placeChestsSlotsAllSides();

        this.data.refresh = true;
        if (craftingStationGui.isOpened()) {
            this.data.wasOpened = true;
        }
        
        chestData = defaultChestData();
        chestData.container = this.container;
        chestData.valid = true;
        debugLog_event("chestData reset, container=" + (this.container ? "valid" : "null") + " valid=" + chestData.valid);

        registerForWindow(chestsWindow, this.container);

        updateResultSlot(this.container);
        refreshRecipeList(this.container, player);
        testRecipeAPI(this.container);
        chestsWindow.forceRefresh();
        this.container.sendChanges();
        chatLog("UI opened — scanning adjacent chests");
        debugLog("click done");
	},

    init: function() {
        debugLog("TileEntity init at " + this.x + "," + this.y + "," + this.z);
        this.container.setWorkbenchFieldPrefix("slotGrid");
    },

    tick: function () {
        if (this.data.tick == 0 || this.data.tick == 10) {
            debugLog("tick: tick=" + this.data.tick + " refresh=" + this.data.refresh + " wasOpened=" + this.data.wasOpened + " guiOpen=" + craftingStationGui.isOpened());
        }
        if (this.data.refresh && this.data.tick > 15) {
            debugLog("tick: refresh period over");
            this.data.refresh = false;
            if (craftingStationGui.isOpened()) {
                this.data.wasOpened = true;
            }
        }

        if (!this.data.refresh && this.data.tick % 5 == 0) {
            if (verifyChestsSlotsAllSides(this.blockSource, this.container, chestsWindow, this.x, this.y, this.z)) {
                debugLog("Chest content changed — syncing slots");
                this.container.sendChanges();
            }
        }

        if (!this.data.refresh && this.data.tick % 3 == 0) {
            updateResultSlot(this.container);
        }
        
        if (!craftingStationGui.isOpened() && this.data.wasOpened) {
            debugLog("UI closed — cleaning chest slot references");
            clearEverything(this.container, chestsWindow);
            var storage = StorageInterface.getInterface(this.container);
            var list = storage.getContainerSlots();
            var onCurrentThread = true;
            chestsWindow.invalidateElements(onCurrentThread);
            this.data.wasOpened = false;
            chestData.valid = false;
            this.container.sendChanges();
        }

        if (this.data.tick > 20) {
            this.data.tick = 0;
        }
        this.data.tick++;
    },

    destroy: function() {
        debugLog("Tile destroyed at " + this.x + "," + this.y + "," + this.z);
        debugLog_event("destroy: setting chestData.valid=false");
        chestData.valid = false;
        clearEverything(this.container, chestsWindow);
        var onCurrentThread = true;

        var storage = StorageInterface.getInterface(this.container);
        var list = storage.getContainerSlots();

        chestsWindow.invalidateElements(onCurrentThread);
        this.container.sendChanges();
        debugLog("destroy done");
    },

    containerEvents: {
        SlotToSlot: function(eventData, connectedClient) {
            debugLog_event("SlotToSlot: playerUid=" + connectedClient.getPlayerUid() + " slot1=" + eventData.slot1 + " slot2=" + eventData.slot2 + " value=" + eventData.value);
            var slot1_raw = this.container.getSlot(eventData.slot1);
            var _slot1_name = slot1_raw.name;
            var _slot1 = parseSlot(_slot1_name);
            var slot1 = slot1_raw.asScriptable();
            debugLog_event("  slot1 name=" + _slot1_name + " id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);
            
            var slot2_raw = this.container.getSlot(eventData.slot2);
            var _slot2_name = slot2_raw.name;
            var _slot2 = parseSlot(_slot2_name);
            var slot2 = slot2_raw.asScriptable();
            debugLog_event("  slot2 name=" + _slot2_name + " id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);
            
            var transferPolicy1 = this.container.getGetTransferPolicy(eventData.slot1);
            var transferPolicy2 = this.container.getAddTransferPolicy(eventData.slot2);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || (slot2.extra != slot1.extra && ((!slot2.extra || slot2.extra.getAllCustomData()) != (!slot1.extra || slot1.extra.getAllCustomData())))) && slot2.id != 0) {
                debugLog_event("  SWAP: different items, swapping slots");
                var transferPolicy3 = this.container.getGetTransferPolicy(eventData.slot2);
                var transferPolicy4 = this.container.getAddTransferPolicy(eventData.slot1);
                if (transferPolicy1 && transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp1 blocked"); return; }
                if (transferPolicy3 && transferPolicy3.transfer(this.container, eventData.slot2, slot2.id, slot2.count, slot2.data, slot2.extra, connectedClient.getPlayerUid()) != slot2.count) { debugLog_event("  tp3 blocked"); return; }
                if (transferPolicy2 && transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp2 blocked"); return; }
                if (transferPolicy4 && transferPolicy4.transfer(this.container, eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra, connectedClient.getPlayerUid()) != slot2.count) { debugLog_event("  tp4 blocked"); return; }

                var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
                var slot2_id = slot2.id, slot2_count = slot2.count, slot2_data = slot2.data, slot2_extra = slot2.extra;

                this.container.setSlot(eventData.slot1, slot2_id, slot2_count, slot2_data, slot2_extra);
                this.container.setSlot(eventData.slot2, slot1_id, slot1_count, slot1_data, slot1_extra);
                this.container.sendChanges();

                if (_slot1) {
                    var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot1.side);
                    chest.setSlot(_slot1.slot, slot1_id, slot1_count, slot1_data, slot1_extra);
                    debugLog_event("  SWAP: chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1_id + " count=" + slot1_count);
                } else {
                    debugLog_event("  SWAP: slot1 not a chest slot, skipping chest sync");
                }

                if (_slot2) {
                    var chest2 = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot2.side);
                    chest2.setSlot(_slot2.slot, slot2_id, slot2_count, slot2_data, slot2_extra);
                    debugLog_event("  SWAP: chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot2_id + " count=" + slot2_count);
                } else {
                    debugLog_event("  SWAP: slot2 not a chest slot, skipping chest sync");
                }
                return;
            }
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot2.id) - slot2.count) : count_value;
            debugLog_event("  MOVE: count_value=" + count_value + " _count=" + _count + " maxStack=" + Item.getMaxStack(slot2.id));
            if (_count <= 0) { debugLog_event("  _count <= 0, returning"); return; }
            if (transferPolicy1) _count = (transferCount = transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid())) != undefined && transferCount != null ? transferCount : _count;
            if (_count <= 0) { debugLog_event("  after tp1: _count <= 0, returning"); return; }
            if (transferPolicy2) _count = (transferCount = transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid())) != undefined && transferCount != null ? transferCount : _count;
            if (_count <= 0) { debugLog_event("  after tp2: _count <= 0, returning"); return; }

            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count, slot2_id = slot2.id;

            this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot2, slot1_id, slot2_id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();

            if (_slot1) {
                var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot1.side);
                chest.setSlot(_slot1.slot, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
                debugLog_event("  chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1_id + " count=" + (slot1_count - _count));
            } else {
                debugLog_event("  move: slot1 not a chest slot, skipping chest sync");
            }

            if (_slot2) {
                var chest2 = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot2.side);
                chest2.setSlot(_slot2.slot, slot1_id, slot2_id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
                debugLog_event("  chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1_id + " count=" + (slot2_id != 0 ? slot2_count + _count : _count));
            } else {
                debugLog_event("  move: slot2 not a chest slot, skipping chest sync");
            }

            this.container.sendChanges();
            debugLog("SlotToSlot: " + slot1_id + " x" + _count + " from " + (_slot1 ? _slot1.side + ":" + _slot1.slot : "grid") + " → " + (_slot2 ? _slot2.side + ":" + _slot2.slot : "grid"));
            debugLog_event("SlotToSlot done");
        },

        InventorySlotToSlot: function(eventData, connectedClient) {
            debugLog_event("InventorySlotToSlot: playerUid=" + connectedClient.getPlayerUid() + " invSlot1=" + eventData.slot1 + " invSlot2=" + eventData.slot2 + " value=" + eventData.value);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot1 = player.getInventorySlot(eventData.slot1);
            var slot2 = player.getInventorySlot(eventData.slot2);
            debugLog_event("  invSlot1: id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);
            debugLog_event("  invSlot2: id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || (slot2.extra != slot1.extra && ((!slot2.extra || slot2.extra.getAllCustomData()) != (!slot1.extra || slot1.extra.getAllCustomData())))) && slot2.id != 0) {
                debugLog_event("  SWAP: different items");
                player.setInventorySlot(eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra);
                player.setInventorySlot(eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra);
                return;
            }
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot2.id) - slot2.count) : count_value;
            debugLog_event("  MOVE: count_value=" + count_value + " _count=" + _count);
            if (_count <= 0) return;
            player.setInventorySlot(eventData.slot1, slot1.id, slot1.count - _count, slot1.data, slot1.extra);
            player.setInventorySlot(eventData.slot2, slot1.id, slot2.id != 0 ? slot2.count + _count : _count, slot1.data, slot1.extra);
            debugLog_event("InventorySlotToSlot done: moved " + _count);
        },

        SlotToInventorySlot: function(eventData, connectedClient) {
            debugLog_event("SlotToInventorySlot: playerUid=" + connectedClient.getPlayerUid() + " slot1=" + eventData.slot1 + " invSlot2=" + eventData.slot2 + " value=" + eventData.value);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot1_raw = this.container.getSlot(eventData.slot1);
            var _slot1_name = slot1_raw.name;
            var _slot1 = parseSlot(_slot1_name);
            var slot1 = slot1_raw.asScriptable();
            debugLog_event("  chestSlot: name=" + _slot1_name + " id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);
            
            var transferPolicy1 = this.container.getGetTransferPolicy(eventData.slot1);
            var slot2 = player.getInventorySlot(eventData.slot2);
            debugLog_event("  invSlot2: id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || (slot2.extra != slot1.extra && ((!slot2.extra || slot2.extra.getAllCustomData()) != (!slot1.extra || slot1.extra.getAllCustomData())))) && slot2.id != 0) {
                debugLog_event("  SWAP: different items");
                var transferPolicy2 = this.container.getAddTransferPolicy(eventData.slot1);
                if (transferPolicy1 && transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp1 blocked"); return; }
                if (transferPolicy2 && transferPolicy2.transfer(this.container, eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra, connectedClient.getPlayerUid()) != slot2.count) { debugLog_event("  tp2 blocked"); return; }

                var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;

                player.setInventorySlot(eventData.slot2, slot1_id, slot1_count, slot1_data, slot1_extra);
                this.container.setSlot(eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra);
                this.container.sendChanges();
                
                if (_slot1) {
                    var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot1.side);
                    chest.setSlot(_slot1.slot, slot1_id, slot1_count, slot1_data, slot1_extra);
                    debugLog_event("  SWAP: chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1_id + " count=" + slot1_count);
                } else {
                    debugLog_event("  SWAP slotToInv: slot1 not a chest slot, skipping chest sync");
                }
                return;
            }
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot2.id) - slot2.count) : count_value;
            debugLog_event("  MOVE: count_value=" + count_value + " _count=" + _count);
            if (_count <= 0) return;
            if (transferPolicy1) _count = (transferCount = transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid())) != undefined && transferCount != null ? transferCount : _count;

            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;

            player.setInventorySlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2.count + _count : _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            
            if (_slot1) {
                var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot1.side);
                chest.setSlot(_slot1.slot, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
                debugLog_event("  chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1_id + " count=" + (slot1_count - _count));
            } else {
                debugLog_event("  move slotToInv: slot1 not a chest slot, skipping chest sync");
            }
            debugLog_event("SlotToInventorySlot done: moved " + _count);
        },

        InventorySlotToContainerSlot: function(eventData, connectedClient) {
            debugLog_event("InventorySlotToContainerSlot: playerUid=" + connectedClient.getPlayerUid() + " invSlot1=" + eventData.slot1 + " slot2=" + eventData.slot2 + " value=" + eventData.value);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot1 = player.getInventorySlot(eventData.slot1);
            debugLog_event("  invSlot1: id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);
            
            var slot2_raw = this.container.getSlot(eventData.slot2);
            var _slot2_name = slot2_raw.name;
            var _slot2 = parseSlot(_slot2_name);
            var slot2 = slot2_raw.asScriptable();
            debugLog_event("  chestSlot: name=" + _slot2_name + " id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);
            
            var transferPolicy2 = this.container.getAddTransferPolicy(eventData.slot2);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || (slot2.extra != slot1.extra && ((!slot2.extra || slot2.extra.getAllCustomData()) != (!slot1.extra || slot1.extra.getAllCustomData())))) && slot2.id != 0) {
                debugLog_event("  SWAP: different items");
                if (transferPolicy2 && transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp2 blocked"); return; }
                player.setInventorySlot(eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra);
                this.container.setSlot(eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra);
                this.container.sendChanges();
                
                if (_slot2) {
                    var chest2 = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot2.side);
                    chest2.setSlot(_slot2.slot, slot1.id, slot1.count, slot1.data, slot1.extra);
                    debugLog_event("  SWAP: chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1.id + " count=" + slot1.count);
                } else {
                    debugLog_event("  SWAP invToContainer: slot2 not a chest slot, skipping chest sync");
                }
                return;
            }
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot1.id) - slot2.count) : count_value;
            debugLog_event("  MOVE: count_value=" + count_value + " _count=" + _count);
            if (_count <= 0) return;
            if (transferPolicy2) _count = (transferCount = transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid())) != undefined && transferCount != null ? transferCount : _count;
            if (_count <= 0) { debugLog_event("  after tp2: _count <= 0"); return; }

            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;

            player.setInventorySlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            
            if (_slot2) {
                var chest2 = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot2.side);
                chest2.setSlot(_slot2.slot, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
                debugLog_event("  chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1_id + " count=" + (slot2.id != 0 ? slot2_count + _count : _count));
            } else {
                debugLog_event("  move invToContainer: slot2 not a chest slot, skipping chest sync");
            }
            debugLog_event("InventorySlotToContainerSlot done: moved " + _count);
        },

        // === Grid transfer handlers (no StorageInterface, only container.setSlot) ===

        gridToChest: function(eventData, connectedClient) {
            debugLog("gridToChest: player=" + connectedClient.getPlayerUid() + " gridSlot=" + eventData.slot1 + " chestSlot=" + eventData.slot2 + " value=" + eventData.value);
            debugLog_event("gridToChest: gridSlot=" + eventData.slot1 + " chestSlot=" + eventData.slot2 + " value=" + eventData.value);
            var slot1 = this.container.getSlot(eventData.slot1).asScriptable();
            var slot2_raw = this.container.getSlot(eventData.slot2);
            var _slot2_name = slot2_raw.name;
            var _slot2 = parseSlot(_slot2_name);
            var slot2 = slot2_raw.asScriptable();
            if (slot1.id == 0 || slot1.count == 0) return;
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot2.id) - slot2.count) : count_value;
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;
            this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            if (_slot2) {
                var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot2.side);
                chest.setSlot(_slot2.slot, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
                debugLog_event("  chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1_id + " count=" + (slot2.id != 0 ? slot2_count + _count : _count));
            }
            updateResultSlot(this.container);
            debugLog_event("gridToChest done");
        },

        chestToGrid: function(eventData, connectedClient) {
            debugLog("chestToGrid: player=" + connectedClient.getPlayerUid() + " chestSlot=" + eventData.slot1 + " gridSlot=" + eventData.slot2 + " value=" + eventData.value);
            debugLog_event("chestToGrid: chestSlot=" + eventData.slot1 + " gridSlot=" + eventData.slot2 + " value=" + eventData.value);
            var slot1_raw = this.container.getSlot(eventData.slot1);
            var _slot1_name = slot1_raw.name;
            var _slot1 = parseSlot(_slot1_name);
            var slot1 = slot1_raw.asScriptable();
            var slot2 = this.container.getSlot(eventData.slot2).asScriptable();
            if (slot1.id == 0 || slot1.count == 0) return;
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot2.id) - slot2.count) : count_value;
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;
            this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            if (_slot1) {
                var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot1.side);
                chest.setSlot(_slot1.slot, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
                debugLog_event("  chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1_id + " count=" + (slot1_count - _count));
            }
            updateResultSlot(this.container);
            debugLog_event("chestToGrid done");
        },

        gridToInventory: function(eventData, connectedClient) {
            debugLog("gridToInventory: player=" + connectedClient.getPlayerUid() + " gridSlot=" + eventData.slot1 + " invSlot=" + eventData.slot2 + " value=" + eventData.value);
            debugLog_event("gridToInventory: gridSlot=" + eventData.slot1 + " invSlot=" + eventData.slot2 + " value=" + eventData.value);
            var slot1 = this.container.getSlot(eventData.slot1).asScriptable();
            if (slot1.id == 0 || slot1.count == 0) return;
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot2 = player.getInventorySlot(eventData.slot2);
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot2.id) - slot2.count) : count_value;
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            player.setInventorySlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2.count + _count : _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            updateResultSlot(this.container);
            debugLog_event("gridToInventory done: moved " + _count);
        },

        inventoryToGrid: function(eventData, connectedClient) {
            debugLog("inventoryToGrid: player=" + connectedClient.getPlayerUid() + " invSlot=" + eventData.slot1 + " gridSlot=" + eventData.slot2 + " value=" + eventData.value);
            debugLog_event("inventoryToGrid: invSlot=" + eventData.slot1 + " gridSlot=" + eventData.slot2 + " value=" + eventData.value);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot1 = player.getInventorySlot(eventData.slot1);
            if (slot1.id == 0 || slot1.count == 0) return;
            var slot2 = this.container.getSlot(eventData.slot2).asScriptable();
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot1.id) - slot2.count) : count_value;
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;
            player.setInventorySlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            updateResultSlot(this.container);
            debugLog_event("inventoryToGrid done: moved " + _count);
        },

        gridToGrid: function(eventData, connectedClient) {
            debugLog("gridToGrid: player=" + connectedClient.getPlayerUid() + " slot1=" + eventData.slot1 + " slot2=" + eventData.slot2 + " value=" + eventData.value);
            debugLog_event("gridToGrid: slot1=" + eventData.slot1 + " slot2=" + eventData.slot2 + " value=" + eventData.value);
            var slot1 = this.container.getSlot(eventData.slot1).asScriptable();
            var slot2 = this.container.getSlot(eventData.slot2).asScriptable();
            if (slot1.id == 0 || slot1.count == 0) return;
            if ((slot2.id != slot1.id || slot2.data != slot1.data || (slot2.extra != slot1.extra && ((!slot2.extra || slot2.extra.getAllCustomData()) != (!slot1.extra || slot1.extra.getAllCustomData())))) && slot2.id != 0) {
                debugLog_event("  SWAP: different items");
                var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
                var slot2_id = slot2.id, slot2_count = slot2.count, slot2_data = slot2.data, slot2_extra = slot2.extra;
                this.container.setSlot(eventData.slot1, slot2_id, slot2_count, slot2_data, slot2_extra);
                this.container.setSlot(eventData.slot2, slot1_id, slot1_count, slot1_data, slot1_extra);
                this.container.sendChanges();
                updateResultSlot(this.container);
                debugLog_event("gridToGrid SWAP done");
                return;
            }
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot2.id) - slot2.count) : count_value;
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;
            this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            updateResultSlot(this.container);
            debugLog_event("gridToGrid MOVE done: " + _count);
        },

        selectRecipe: function(eventData, connectedClient) {
            debugLog("selectRecipe: player=" + connectedClient.getPlayerUid() + " index=" + eventData.index);
            var recipe = _cachedRecipes && _cachedRecipes[eventData.index];
            if (!recipe) { debugLog("  recipe not found at index " + eventData.index); return; }
            var result = recipe.getResult();
            if (!result) { debugLog("  recipe has no result"); return; }
            debugLog("  selected result id=" + result.id);

            // Return current grid items to player inventory
            returnGridToInventory(this.container, connectedClient.getPlayerUid());

            // Fill grid with recipe ingredients from chests + inventory
            var placed = 0;
            try {
                var entries = recipe.getSortedEntries();
                for (var i = 0; i < 9; i++) {
                    var entry = entries[i];
                    if (entry && entry.id > 0) {
                        var eid = entry.id;
                        var edata = entry.data;
                        var need = entry.count || 1;

                        // Track actual data/extra from items found (for wildcard entries like any wood)
                        var actualData = edata > -1 ? edata : -1;
                        var actualExtra = null;

                        // Try to pull from chests first via StorageInterface
                        var taken = 0;
                        for (var side = 0; side < 6 && taken < need; side++) {
                            try {
                                var storage = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, side);
                                if (storage) {
                                    var slots = storage.getContainerSlots();
                                    for (var si = 0; si < slots.length && taken < need; si++) {
                                        var chestSlot = storage.getSlot(slots[si]);
                                        if (chestSlot && chestSlot.id == eid && (chestSlot.data == edata || edata == -1) && chestSlot.count > 0) {
                                            var take = Math.min(chestSlot.count, need - taken);
                                            if (actualData == -1) actualData = chestSlot.data;
                                            if (!actualExtra) actualExtra = chestSlot.extra || null;
                                            storage.setSlot(slots[si], chestSlot.id, chestSlot.count - take, chestSlot.data, chestSlot.extra);
                                            taken += take;
                                        }
                                    }
                                }
                            } catch (e) {}
                        }

                        // Then pull from player inventory if still needed
                        if (taken < need) {
                            try {
                                var player = new PlayerActor(connectedClient.getPlayerUid());
                                for (var pi = 0; pi < 36 && taken < need; pi++) {
                                    var invSlot = player.getInventorySlot(pi);
                                    if (invSlot && invSlot.id == eid && (invSlot.data == edata || edata == -1) && invSlot.count > 0) {
                                        var take = Math.min(invSlot.count, need - taken);
                                        if (actualData == -1) actualData = invSlot.data;
                                        if (!actualExtra) actualExtra = invSlot.extra || null;
                                        player.setInventorySlot(pi, invSlot.id, invSlot.count - take, invSlot.data, invSlot.extra);
                                        taken += take;
                                    }
                                }
                            } catch (e) {}
                        }

                        this.container.setSlot("slotGrid" + i, eid, taken, actualData > -1 ? actualData : 0, actualExtra);
                        if (taken > 0) placed++;
                    } else {
                        this.container.setSlot("slotGrid" + i, 0, 0, 0);
                    }
                }
            } catch (e) { debugLog("selectRecipe fill error: " + e); }

            this.container.sendChanges();
            updateResultSlot(this.container);
            debugLog("selectRecipe done: " + placed + " slots filled");
        },

        craftOnce: function(eventData, connectedClient) {
            debugLog("craftOnce called by player=" + connectedClient.getPlayerUid());
            var result = Recipes.getRecipeResult(this.container);
            if (!result) { debugLog("  no recipe in grid"); return; }
            debugLog_event("  recipe result: id=" + result.id + " count=" + result.count + " data=" + result.data);
            var crafted = Recipes.provideRecipeForPlayer(this.container, "", -1);
            if (crafted) {
                debugLog_event("  providedRecipe: id=" + crafted.id + " count=" + crafted.count + " -> player=" + connectedClient.getPlayerUid());
                var player = new PlayerActor(connectedClient.getPlayerUid());
                player.addItemToInventory(crafted.id, crafted.count, crafted.data, crafted.extra || null, false);
                this.container.sendChanges();
                updateResultSlot(this.container);
                debugLog("  craftOnce done: " + crafted.count + "x id=" + crafted.id);
            } else {
                debugLog("  provideRecipeForPlayer returned null");
            }
        },

        craftStack: function(eventData, connectedClient) {
            debugLog("craftStack called by player=" + connectedClient.getPlayerUid());
            var result = Recipes.getRecipeResult(this.container);
            if (!result) { debugLog("  no recipe in grid"); return; }
            debugLog_event("  recipe result: id=" + result.id + " count=" + result.count + " data=" + result.data);
            var maxStack = Item.getMaxStack(result.id);
            var count = 0;
            for (var i = 0; i < maxStack && count < maxStack; i += result.count) {
                var crafted = Recipes.provideRecipeForPlayer(this.container, "", -1);
                if (!crafted) { debugLog("  provideRecipe failed at iteration " + i); break; }
                var player = new PlayerActor(connectedClient.getPlayerUid());
                player.addItemToInventory(crafted.id, crafted.count, crafted.data, crafted.extra || null, false);
                count += crafted.count;
                debugLog_event("  stack iteration " + i + ": crafted " + crafted.count + " total=" + count);
                if (count >= maxStack) break;
            }
            if (count > 0) {
                this.container.sendChanges();
                updateResultSlot(this.container);
                debugLog("  craftStack done: " + count + " items");
            } else {
                debugLog("  craftStack: nothing crafted");
            }
        },

        craftAll: function(eventData, connectedClient) {
            debugLog("craftAll called by player=" + connectedClient.getPlayerUid());
            var recipe = Recipes.getRecipeByField(this.container, "");
            if (!recipe) { debugLog("  no recipe by field"); return; }
            var result = recipe.getResult();
            if (!result) { debugLog("  recipe has no result"); return; }
            debugLog_event("  recipe result: id=" + result.id + " count=" + result.count);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            if (!player) { debugLog("  cannot create PlayerActor"); return; }
            var totalCrafted = 0;
            for (var c = 0; c < 64; c++) {
                var filled = refillGridFromChests(this.container, recipe, connectedClient.getPlayerUid());
                debugLog_event("  craftAll iteration " + c + ": refill=" + filled);
                if (!filled) { debugLog("  refill failed at iteration " + c); break; }
                var crafted = Recipes.provideRecipeForPlayer(this.container, "", -1);
                if (!crafted) { debugLog("  provideRecipe failed at iteration " + c); break; }
                player.addItemToInventory(crafted.id, crafted.count, crafted.data, crafted.extra || null, true);
                totalCrafted += crafted.count;
                debugLog_event("  iteration " + c + ": crafted " + crafted.count + " total=" + totalCrafted);
            }
            if (totalCrafted > 0) {
                this.container.sendChanges();
                updateResultSlot(this.container);
                debugLog("  craftAll done: " + totalCrafted + " items total");
            } else {
                debugLog("  craftAll: nothing crafted");
            }
        },

        clearGrid: function(eventData, connectedClient) {
            debugLog("clearGrid called by player=" + connectedClient.getPlayerUid());
            var player = new PlayerActor(connectedClient.getPlayerUid());
            if (!player) { debugLog("  cannot create PlayerActor"); return; }
            var returned = 0;
            for (var i = 0; i < 9; i++) {
                var slot = this.container.getSlot("slotGrid" + i);
                if (slot && slot.count > 0) {
                    debugLog_event("  returning slotGrid" + i + ": id=" + slot.id + " count=" + slot.count + " to player inventory");
                    player.addItemToInventory(slot.id, slot.count, slot.data, slot.extra || null, true);
                    returned++;
                }
                this.container.setSlot("slotGrid" + i, 0, 0, 0);
            }
            this.container.sendChanges();
            updateResultSlot(this.container);
            debugLog("clearGrid done: " + returned + " slots cleared, empty slots cleaned");
        },

        autoFillGrid: function(eventData, connectedClient) {
            debugLog("autoFillGrid called by player=" + connectedClient.getPlayerUid());
            var recipe = Recipes.getRecipeByField(this.container, "");
            if (!recipe) { debugLog("  no recipe by field"); return; }
            debugLog_event("  autoFill recipe result: id=" + recipe.getResult().id);
            try {
                var entries = recipe.getSortedEntries();
                var totalTaken = 0;
                for (var i = 0; i < 9; i++) {
                    var entry = entries[i];
                    if (!entry || entry.id <= 0) continue;
                    var gridSlot = this.container.getSlot("slotGrid" + i);
                    var need = entry.count;
                    var have = gridSlot ? gridSlot.count : 0;
                    var missing = need - have;
                    if (missing <= 0) continue;
                    debugLog_event("  slotGrid" + i + ": need=" + need + " have=" + have + " missing=" + missing + " item=" + entry.id);

                    // Search chests first
                    var taken = 0;
                    for (var side = 0; side < 6 && taken < missing; side++) {
                        try {
                            var storage = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, side);
                            if (storage) {
                                var slots = storage.getContainerSlots();
                                for (var si = 0; si < slots.length && taken < missing; si++) {
                                    var chestSlot = storage.getSlot(slots[si]);
                                    if (chestSlot && chestSlot.id == entry.id && (chestSlot.data == entry.data || entry.data == -1) && chestSlot.count > 0) {
                                        var take = Math.min(chestSlot.count, missing - taken);
                                        storage.setSlot(slots[si], chestSlot.id, chestSlot.count - take, chestSlot.data, chestSlot.extra);
                                        taken += take;
                                        debugLog_event("    pulled " + take + " from side " + side + " slot " + si + " (chest)");
                                    }
                                }
                            }
                        } catch (e) {}
                    }

                    // If still missing, try player inventory
                    if (taken < missing) {
                        try {
                            var player = new PlayerActor(connectedClient.getPlayerUid());
                            for (var pi = 0; pi < 36 && taken < missing; pi++) {
                                var invSlot = player.getInventorySlot(pi);
                                if (invSlot && invSlot.id == entry.id && (invSlot.data == entry.data || entry.data == -1) && invSlot.count > 0) {
                                    var take = Math.min(invSlot.count, missing - taken);
                                    player.setInventorySlot(pi, invSlot.id, invSlot.count - take, invSlot.data, invSlot.extra);
                                    taken += take;
                                    debugLog_event("    pulled " + take + " from inv slot " + pi);
                                }
                            }
                        } catch (e) {}
                    }

                    if (taken > 0) {
                        this.container.setSlot("slotGrid" + i, entry.id, have + taken, entry.data > -1 ? entry.data : 0);
                        totalTaken += taken;
                    }
                }
                this.container.sendChanges();
                updateResultSlot(this.container);
                debugLog("autoFillGrid done: " + totalTaken + " items moved to grid");
            } catch (e) { debugLog("autoFillGrid error: " + e); }
        },
    },
});

Block.registerNeighbourChangeFunction("craftingStationBlock", function(coords, block, changedCoords, region) {});
