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
        width: 250,
        height: screenHeight - 45,
    },
    drawing: [
        { type: "background", color: android.graphics.Color.BLUE }
    ],
    elements: {}
});
debugLog_ui("Recipe window created (empty)");

// Player inventory panel (center)
var invSlotSize = 167;
var invInRow = 6;

function PlayerInventorySlots() {
    var elements = {};
    var startX = 0;
    for (var i = 0; i < 36; i++) {
        var x = i % invInRow; 
        var y = Math.floor(i / invInRow);  
        elements["invSlot" + i] = {
            type: "invSlot",  
            x: startX + x * invSlotSize,
            y: y * invSlotSize,
            size: invSlotSize,
            index: i,
        };
    }
    return elements;
}

var elements = PlayerInventorySlots();
debugLog_ui("Inventory slots created: " + Object.keys(elements).length);

var inventoryWindow = new UI.Window({
    location: {
        x: 260,
        y: screenHeight / 3,
        width: 365,
        height: screenHeight * 2 / 3 - 5,
        scrollY: invSlotSize / 2.74 * Math.trunc(36 / invInRow),
    },
    drawing: [
        { type: "background", color: android.graphics.Color.YELLOW }
    ],
    elements: elements
});
inventoryWindow.setInventoryNeeded(true);
debugLog_ui("Inventory window created, scrollY=" + (invSlotSize / 2.74 * Math.trunc(36 / invInRow)));

// Connected chests panel (right side)
var chestsWindow = new UI.Window({
    location: {
        x: 630,
        y: 40,
        width: 315,
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
craftingStationGui.addWindowInstance("inventoryWindow", inventoryWindow);
craftingStationGui.addWindowInstance("chestsWindow", chestsWindow);
debugLog_ui("WindowGroup created with 4 windows");

registerForWindow(inventoryWindow, this.container);

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
            debugLog_event("TransferPolicy: accepting " + count + " of id=" + id + " into slot '" + name + "'");
            return count;
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

        chestsWindow.forceRefresh();
        this.container.sendChanges();
        chatLog("UI opened — scanning adjacent chests");
        debugLog("click done");
	},

    init: function() {
        debugLog("TileEntity init at " + this.x + "," + this.y + "," + this.z);
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

        if (!this.data.refresh && this.data.tick == 3) {
            if (verifyChestsSlotsAllSides(this.blockSource, this.container, chestsWindow, this.x, this.y, this.z)) {
                debugLog("Chest content changed — syncing slots");
                this.container.sendChanges();
            }
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
            var slot1 = this.container.getSlot(eventData.slot1);
            var _slot1 = parseSlot(slot1.name); 
            debugLog_event("  slot1 name=" + slot1.name + " id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);
            
            var slot2 = this.container.getSlot(eventData.slot2);
            var _slot2 = parseSlot(slot2.name); 
            var slot2 = this.container.getSlot(eventData.slot2).asScriptable();
            debugLog_event("  slot2 name=" + slot2.name + " id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);
            
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
                
                // Update container FIRST to prevent stale data → item duplication
                this.container.setSlot(eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra);
                this.container.setSlot(eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra);
                this.container.sendChanges();
                
                var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot1.side);
                chest.setSlot(_slot1.slot, slot1.id, slot1.count, slot1.data, slot1.extra);
                debugLog_event("  SWAP: chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1.id + " count=" + slot1.count);

                var chest2 = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot2.side);
                chest2.setSlot(_slot2.slot, slot2.id, slot2.count, slot2.data, slot2.extra);
                debugLog_event("  SWAP: chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot2.id + " count=" + slot2.count);
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
            
            // Update container FIRST to prevent stale data → item duplication
            this.container.setSlot(eventData.slot1, slot1.id, slot1.count - _count, slot1.data, slot1.extra);
            this.container.setSlot(eventData.slot2, slot1.id, slot2.id != 0 ? slot2.count + _count : _count, slot1.data, slot1.extra);
            this.container.sendChanges();

            var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot1.side);
            chest.setSlot(_slot1.slot, slot1.id, slot1.count - _count, slot1.data, slot1.extra);
            debugLog_event("  chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1.id + " count=" + (slot1.count - _count));

            var chest2 = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot2.side);
            chest2.setSlot(_slot2.slot, slot1.id, slot2.id != 0 ? slot2.count + _count : _count, slot1.data, slot1.extra);
            debugLog_event("  chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1.id + " count=" + (slot2.id != 0 ? slot2.count + _count : _count));

            this.container.sendChanges();
            debugLog("SlotToSlot: " + slot1.id + " x" + _count + " from " + _slot1.side + ":" + _slot1.slot + " → " + _slot2.side + ":" + _slot2.slot);
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
            var slot1 = this.container.getSlot(eventData.slot1);
            var _slot1 = parseSlot(slot1.name); 
            var slot1 = this.container.getSlot(eventData.slot1).asScriptable();
            debugLog_event("  chestSlot: name=" + slot1.name + " id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);
            
            var transferPolicy1 = this.container.getGetTransferPolicy(eventData.slot1);
            var slot2 = player.getInventorySlot(eventData.slot2);
            debugLog_event("  invSlot2: id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || (slot2.extra != slot1.extra && ((!slot2.extra || slot2.extra.getAllCustomData()) != (!slot1.extra || slot1.extra.getAllCustomData())))) && slot2.id != 0) {
                debugLog_event("  SWAP: different items");
                var transferPolicy2 = this.container.getAddTransferPolicy(eventData.slot1);
                if (transferPolicy1 && transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp1 blocked"); return; }
                if (transferPolicy2 && transferPolicy2.transfer(this.container, eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra, connectedClient.getPlayerUid()) != slot2.count) { debugLog_event("  tp2 blocked"); return; }
                player.setInventorySlot(eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra);
                this.container.setSlot(eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra);
                this.container.sendChanges();
                
                var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot1.side);
                chest.setSlot(_slot1.slot, slot1.id, slot1.count, slot1.data, slot1.extra);
                debugLog_event("  SWAP: chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1.id + " count=" + slot1.count);
                return;
            }
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot2.id) - slot2.count) : count_value;
            debugLog_event("  MOVE: count_value=" + count_value + " _count=" + _count);
            if (_count <= 0) return;
            if (transferPolicy1) _count = (transferCount = transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid())) != undefined && transferCount != null ? transferCount : _count;
            
            player.setInventorySlot(eventData.slot2, slot1.id, slot2.id != 0 ? slot2.count + _count : _count, slot1.data, slot1.extra);
            this.container.setSlot(eventData.slot1, slot1.id, slot1.count - _count, slot1.data, slot1.extra);
            this.container.getSlot(eventData.slot1).validate();
            this.container.sendChanges();
            
            var chest = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot1.side);
            chest.setSlot(_slot1.slot, slot1.id, slot1.count - _count, slot1.data, slot1.extra);
            debugLog_event("  chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1.id + " count=" + (slot1.count - _count));
            debugLog_event("SlotToInventorySlot done: moved " + _count);
        },

        InventorySlotToContainerSlot: function(eventData, connectedClient) {
            debugLog_event("InventorySlotToContainerSlot: playerUid=" + connectedClient.getPlayerUid() + " invSlot1=" + eventData.slot1 + " slot2=" + eventData.slot2 + " value=" + eventData.value);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot1 = player.getInventorySlot(eventData.slot1);
            debugLog_event("  invSlot1: id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);
            
            var slot2 = this.container.getSlot(eventData.slot2);
            var _slot2 = parseSlot(slot2.name); 
            var slot2 = this.container.getSlot(eventData.slot2).asScriptable();
            debugLog_event("  chestSlot: name=" + slot2.name + " id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);
            
            var transferPolicy2 = this.container.getAddTransferPolicy(eventData.slot2);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || (slot2.extra != slot1.extra && ((!slot2.extra || slot2.extra.getAllCustomData()) != (!slot1.extra || slot1.extra.getAllCustomData())))) && slot2.id != 0) {
                debugLog_event("  SWAP: different items");
                if (transferPolicy2 && transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp2 blocked"); return; }
                player.setInventorySlot(eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra);
                this.container.setSlot(eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra);
                this.container.sendChanges();
                
                var chest2 = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot2.side);
                chest2.setSlot(_slot2.slot, slot2.id, slot2.count, slot2.data, slot2.extra);
                debugLog_event("  SWAP: chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot2.id + " count=" + slot2.count);
                return;
            }
            var count_value = slot1.count * Math.min(1, Math.max(0, eventData.value));
            var _count = slot2.id != 0 ? Math.min(count_value, Item.getMaxStack(slot2.id) - slot2.count) : count_value;
            debugLog_event("  MOVE: count_value=" + count_value + " _count=" + _count);
            if (_count <= 0) return;
            if (transferPolicy2) _count = (transferCount = transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid())) != undefined && transferCount != null ? transferCount : _count;
            if (_count <= 0) { debugLog_event("  after tp2: _count <= 0"); return; }
            player.setInventorySlot(eventData.slot1, slot1.id, slot1.count - _count, slot1.data, slot1.extra);
            this.container.setSlot(eventData.slot2, slot1.id, slot2.id != 0 ? slot2.count + _count : _count, slot1.data, slot1.extra);
            this.container.sendChanges();
            
            var chest2 = StorageInterface.getNeighbourStorage(this.blockSource, {x: this.x, y: this.y, z: this.z}, _slot2.side);
            chest2.setSlot(_slot2.slot, slot2.id, slot2.id != 0 ? slot2.count + _count : _count, slot2.data, slot2.extra);
            debugLog_event("  chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1.id + " count=" + (slot2.id != 0 ? slot2.count + _count : _count));
            debugLog_event("InventorySlotToContainerSlot done: moved " + _count);
        },
    },
});

Block.registerNeighbourChangeFunction("craftingStationBlock", function(coords, block, changedCoords, region) {});
