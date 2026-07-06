// Chest window management — scans adjacent containers and creates dynamic UI slots

IMPORT('StorageInterface');

// Tracks which sides have containers and how many slots each has
sideInfo = {
    "0": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "1": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "2": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "3": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "4": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "5": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
};

sideInfoBackUp = {
    "0": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "1": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "2": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "3": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "4": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
    "5": { length_: 0, lastLength_: 0, present: false, lastY: 0 },
};

var chestsWindowElements = {};
var screenHeight = UI.getScreenHeight();

var chestSlotSize = 167;
var chestInRow = 6;

// Scans all 6 sides for adjacent containers and records their slot counts
function infoAllSides(blockSource, x, y, z) {
    debugLog_chest("infoAllSides called at " + x + "," + y + "," + z);
    for (var side = 0; side < 6; side++) {
        var storage = StorageInterface.getNeighbourStorage(blockSource, {x: x, y: y, z: z}, side);
        debugLog_chest("  side " + side + ": storage=" + (storage != null ? "found" : "null"));
        if (storage != null) {
            var chestsInventory = storage.getContainerSlots();
            var length = chestsInventory.length;
            debugLog_chest("  side " + side + " slots=" + length + " names=" + JSON.stringify(chestsInventory));
            if (length > 0) {
                sideInfo[side].length_ = length;
                sideInfo[side].present = true;
                debugLog("Chest found on side " + side + " with " + length + " slots");
                chatLog("Chest found on side " + side + " with " + length + " slots");
            } else {
                sideInfo[side].length_ = 0;
                sideInfo[side].present = false;
            }
        } else {
            sideInfo[side].length_ = 0;
            sideInfo[side].present = false;
        }
    }
    debugLog_chest("infoAllSides done — sideInfo: " + JSON.stringify(sideInfo));
}

// Removes all chest slot references from container and UI (preserves grid slots)
function clearEverything(container, window) {
    debugLog_chest("clearEverything called — container=" + (container ? "valid" : "null") + " window=" + (window ? "valid" : "null"));
    chestData.valid = false;
    var storage = StorageInterface.getInterface(container);

    // Save grid slots before clearing
    var gridSlots = {};
    for (var i = 0; i < 9; i++) {
        var gs = container.getSlot("slotGrid" + i);
        if (gs && gs.id > 0) {
            gridSlots["slotGrid" + i] = { id: gs.id, count: gs.count, data: gs.data, extra: gs.extra || null };
        }
    }
    var savedCount = Object.keys(gridSlots).length;
    debugLog_chest("clearEverything: saved " + savedCount + " grid slots");

    storage.clearContainer();

    // Restore grid slots
    var restoredCount = 0;
    for (var i = 0; i < 9; i++) {
        var key = "slotGrid" + i;
        if (gridSlots[key]) {
            container.setSlot(key, gridSlots[key].id, gridSlots[key].count, gridSlots[key].data, gridSlots[key].extra);
            restoredCount++;
        }
    }

    for (var side = 0; side < 6; side++) {
        var length = sideInfo[side].length_ || 0;
        if (length > 0) debugLog_chest("  clearing side " + side + " (" + length + " slots)");
        for (var i = 0; i < length; i++) {
            container.clearSlot("side" + side + "slot" + i);
            chestsWindowElements["side" + side + "slot" + i] = { type: "_invalidate" };
        }
    }
    for (var i = 0; i < 6; i++) {
        sideInfo[i] = {
            length_: 0, 
            lastLength_: 0,
            present: false,
            lastY: 0
        }
    }
    container.sendChanges();
    debugLog_chest("clearEverything done (grid preserved)");
}

// Calculates scroll height based on total slot content height
function setScrollY() {
    var max = 0;
    for (var i = 0; i < 6; i++) {
        if (sideInfo[i].lastY > max) {
            max = sideInfo[i].lastY;
        }
    }
    debugLog_ui("setScrollY: contentHeight=" + max + " screenHeight=" + screenHeight);
    if (max > screenHeight) {
        max = max / 3;
        debugLog_ui("  scroll set to " + max + " (content > screen, divided by 3)");
    } else {
        max = 0;
        debugLog_ui("  no scroll needed (content <= screen)");
    }
    chestsWindow.location.setScroll(0, max);
}

// Creates slot elements in the chest window for all sides
function placeChestsSlotsAllSides() {
    debugLog_ui("placeChestsSlotsAllSides — creating slot elements");
    for (var side = 0; side < 6; side++) {
        var length = sideInfo[side].length_;
        var y = 0;
        var surplus = 0;
        if (side != 0) {
            surplus = sideInfo[side - 1].lastY;
        }
        debugLog_ui("  side " + side + ": length=" + length + " surplus=" + surplus);
        for (var i = 0; i < length; i++) {
            var x = i % chestInRow; 
            y = Math.floor(i / chestInRow);
            chestsWindowElements["side" + side + "slot" + i] = {
                type: "slot",  
                x: x * chestSlotSize,
                y: y * chestSlotSize + surplus,
                size: chestSlotSize,
                sideNumber: side,
                slotNumber: i,
            }
        }
        if (sideInfo[side].present) {
            sideInfo[side].lastY = surplus + y * chestSlotSize + chestSlotSize;
        } else {
            sideInfo[side].lastY = surplus;
        }
        sideInfo[side].lastLength_ = length;
    }
    setScrollY(sideInfo);
    debugLog_ui("placeChestsSlotsAllSides done — elements: " + Object.keys(chestsWindowElements).length);
}

// Copies items from adjacent containers into the crafting station container slots
function setChestsSlotsAllSides(blockSource, container, x, y, z) {
    debugLog_chest("setChestsSlotsAllSides at " + x + "," + y + "," + z);
    for (var side = 0; side < 6; side++) {
        var storage = StorageInterface.getNeighbourStorage(blockSource, {x: x, y: y, z: z}, side);
        if (storage != null) {
            var chestsInventory = storage.getContainerSlots();
            var length = chestsInventory.length;
            debugLog_chest("  side " + side + ": " + length + " slots in chest");
            if (length > 0) {
                var j = 0;
                for (var i of chestsInventory) {
                    var slot = storage.getSlot(i);
                    debugLog_chest("    slot " + j + " ← chest[" + i + "]: id=" + slot.id + " count=" + slot.count + " data=" + slot.data + " extra=" + (slot.extra ? "yes" : "no"));
                    container.setSlot("side" + side + "slot" + j, slot.id, slot.count, slot.data, slot.extra);
                    j++;
                }
            }
        } else {
            debugLog_chest("  side " + side + ": no storage");
        }
    }
}

// Checks if chest contents changed and syncs them back
function verifyChestsSlotsAllSides(blockSource, container, window, x, y, z) {
    var send = false;
    for (var side = 0; side < 6; side++) {
        var storage = StorageInterface.getNeighbourStorage(blockSource, {x: x, y: y, z: z}, side);
        if (storage != null) {
            var chestsInventory = storage.getContainerSlots();
            var length = chestsInventory.length;
            if (length > 0) {
                var j = 0;
                for (var i of chestsInventory) {
                    var slot = storage.getSlot(i);
                    var slotC = container.getSlot("side" + side + "slot" + j);
                    if (slot.id != slotC.id || slot.count != slotC.count || slot.data != slotC.data || slot.extra != slotC.extra) {
                        debugLog_chest("verifyChests: slot " + side + ":" + j + " changed — chest(id=" + slot.id + " cnt=" + slot.count + ") vs container(id=" + slotC.id + " cnt=" + slotC.count + ")");
                        container.setSlot("side" + side + "slot" + j, slot.id, slot.count, slot.data, slot.extra);
                        send = true;
                    }
                    j++;
                }
            }
        }
    }
    return send;
}

// Extracts side and slot number from a slot name like "side2slot5"
function parseSlot(str) {
    for (var side = 0; side < 6; side++) {
        for (var slot = 0; slot < 54; slot++) {
            if (str == "side" + side + "slot" + slot) {
                debugLog_event("parseSlot: '" + str + "' → side=" + side + " slot=" + slot);
                return { side: side, slot: slot };
            }
        }    
    }
    debugLog_event("parseSlot: '" + str + "' → null (not a chest slot)");
    return null;
}
