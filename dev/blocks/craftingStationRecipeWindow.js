// Recipe list panel — left side
// Shows ALL recipe results, darkens unavailable ones (Refined Storage pattern)

var recipeWindowWidth = 240;
var recipeSlotSize = 56;
var recipeColumns = 4;
var recipeSlotPadding = 3;
var recipeStartX = 6;
var recipeStartY = 6;

var _cachedRecipes = [];
var _recipeDarkenMap = {};
var totalRecipeSlots = 30;
var recipeWindowElements = {};

function setupRecipeWindow(recipeWin) {
    debugLog_ui("setupRecipeWindow called");

    for (var i = 0; i < totalRecipeSlots; i++) {
        var col = i % recipeColumns;
        var row = Math.floor(i / recipeColumns);
        var sx = recipeStartX + col * (recipeSlotSize + recipeSlotPadding);
        var sy = recipeStartY + row * (recipeSlotSize + recipeSlotPadding);

        (function(idx, slotX, slotY) {
            recipeWindowElements["recipeSlot" + idx] = {
                type: "slot",
                x: slotX,
                y: slotY,
                size: recipeSlotSize,
                clicker: {
                    onClick: function(container, window, element) {
                        var c = container && container.getParent ? container.getParent() : container;
                        onRecipeSlotClick(idx, c);
                    }
                }
            };
        })(i, sx, sy);
    }

    var totalRows = Math.ceil(totalRecipeSlots / recipeColumns);
    var totalHeight = totalRows * (recipeSlotSize + recipeSlotPadding) + recipeStartY;
    recipeWin.location.setScroll(0, Math.max(0, totalHeight - recipeWin.location.height));

    recipeWindowElements["recipeInfoText"] = {
        type: "text",
        x: 5,
        y: totalHeight + 10,
        text: "Tap a recipe to fill grid",
        font: { color: android.graphics.Color.GRAY, size: 12 }
    };
}

// Search player inventory server-side (Refined Storage searchItem pattern)
function searchInventory(itemId, itemData, playerUid) {
    if (!playerUid) return null;
    try {
        var player = new PlayerActor(playerUid);
        if (!player) return null;
        for (var i = 0; i < 36; i++) {
            var slot = player.getInventorySlot(i);
            if (slot && slot.id == itemId && (slot.data == itemData || itemData == -1) && slot.count > 0) {
                return slot;
            }
        }
    } catch (e) {}
    return null;
}

// Count available items across grid + inventory + chests
function countAvailableItem(itemId, itemData, container, playerUid) {
    var total = 0;
    for (var i = 0; i < 9; i++) {
        var slot = container.getSlot("slotGrid" + i);
        if (slot && slot.id == itemId && (slot.data == itemData || itemData == -1)) total += slot.count;
    }
    if (playerUid) {
        var invItem = searchInventory(itemId, itemData, playerUid);
        if (invItem) total += invItem.count;
    }
    for (var side = 0; side < 6; side++) {
        if (sideInfo && sideInfo[side] && sideInfo[side].present) {
            for (var s = 0; s < sideInfo[side].length_; s++) {
                var chestSlot = container.getSlot("side" + side + "slot" + s);
                if (chestSlot && chestSlot.id == itemId && (chestSlot.data == itemData || itemData == -1)) total += chestSlot.count;
            }
        }
    }
    return total;
}

// Check if ALL ingredients of a recipe are available (for darken)
function isRecipeCraftable(recipe, container, playerUid) {
    try {
        var entries = recipe.getSortedEntries();
        if (!entries) return false;
        var len = entries.length || 0;
        for (var i = 0; i < len; i++) {
            var entry = entries[i];
            if (!entry || !entry.id || entry.id <= 0) continue;
            var need = entry.count || 1;
            var have = countAvailableItem(entry.id, entry.data, container, playerUid);
            if (have < need) return false;
        }
        return true;
    } catch (e) { return false; }
}

// Convert Java Collection to JS array
function getAllWorkbenchRecipes() {
    try {
        if (typeof Recipes.getAllWorkbenchRecipes != "function") return null;
        var collection = Recipes.getAllWorkbenchRecipes();
        if (!collection) return null;
        var size = typeof collection.size == "function" ? collection.size() : collection.length;
        if (!size || size <= 0) return null;
        if (typeof collection.iterator != "function") return null;
        var arr = [];
        var iter = collection.iterator();
        while (iter.hasNext()) {
            arr.push(iter.next());
            if (arr.length % 500 == 0) java.lang.Thread.yield();
        }
        debugLog("getAllWorkbenchRecipes: " + arr.length + " recipes loaded");
        return arr;
    } catch (e) {
        debugLog("getAllWorkbenchRecipes error: " + e);
        return null;
    }
}

// Refresh recipe list — shows ALL recipes with darken for unavailable
function refreshRecipeList(container, playerUid) {
    debugLog("refreshRecipeList called");

    var allRecipes = getAllWorkbenchRecipes();
    if (!allRecipes) {
        for (var i = 0; i < totalRecipeSlots; i++) {
            container.setSlot("recipeSlot" + i, 0, 0, 0);
        }
        container.sendChanges();
        recipeWindow.forceRefresh();
        return;
    }

    // Deduplicate recipes by result ID (keep first occurrence of each result)
    var seenResults = {};
    var deduped = [];
    for (var r = 0; r < allRecipes.length; r++) {
        var res = allRecipes[r].getResult();
        if (!res) continue;
        var key = res.id + "_" + res.data;
        if (!seenResults[key]) {
            seenResults[key] = true;
            deduped.push(allRecipes[r]);
        }
    }
    debugLog("refreshRecipeList: " + allRecipes.length + " total, " + deduped.length + " unique results");

    var totalToShow = Math.min(deduped.length, totalRecipeSlots);
    var totalRows = Math.ceil(totalToShow / recipeColumns);
    var totalHeight = totalRows * (recipeSlotSize + recipeSlotPadding) + recipeStartY;
    var scrollNeeded = Math.max(0, totalHeight - recipeWindow.location.height);

    // Calculate craftable status in background thread
    var thread = java.lang.Thread({
        run: function() {
            try {
                var darkenMap = {};
                var slotData = [];
                for (var r = 0; r < totalToShow; r++) {
                    var recipe = deduped[r];
                    var result = recipe.getResult();
                    slotData.push(result ? { id: result.id, count: result.count, data: result.data, extra: result.extra || null } : { id: 0, count: 0, data: 0, extra: null });
                    darkenMap["recipeSlot" + r] = !isRecipeCraftable(recipe, container, playerUid);
                    if (r % 50 == 0) java.lang.Thread.yield();
                }

                _cachedRecipes = deduped.slice(0, totalToShow);
                _recipeDarkenMap = darkenMap;

                // Update container and UI on main thread
                UI.getContext().runOnUiThread(new java.lang.Runnable({
                    run: function() {
                        for (var r = 0; r < totalToShow; r++) {
                            container.setSlot("recipeSlot" + r, slotData[r].id, slotData[r].count, slotData[r].data, slotData[r].extra);
                        }
                        for (var r = totalToShow; r < totalRecipeSlots; r++) {
                            container.setSlot("recipeSlot" + r, 0, 0, 0);
                        }
                        container.sendChanges();

                        for (var key in darkenMap) {
                            if (recipeWindowElements[key]) {
                                recipeWindowElements[key].darken = darkenMap[key];
                            }
                        }

                        recipeWindow.location.setScroll(0, scrollNeeded);
                        recipeWindow.forceRefresh();

                        var darkened = 0;
                        for (var k in darkenMap) { if (darkenMap[k]) darkened++; }
                        debugLog("refreshRecipeList: " + totalToShow + " unique recipes, " + darkened + " darkened, scroll=" + scrollNeeded);
                    }
                }));
            } catch (e) {
                debugLog("refreshRecipeList thread error: " + e);
            }
        }
    });
    thread.setPriority(java.lang.Thread.MIN_PRIORITY);
    thread.start();
}

function returnGridItems(container) {
    for (var i = 0; i < 9; i++) {
        var slot = container.getSlot("slotGrid" + i);
        if (slot && slot.id > 0 && slot.count > 0) {
            try {
                var player = new PlayerActor(Player.get());
                player.addItemToInventory(slot.id, slot.count, slot.data, slot.extra || null, true);
            } catch (e) {}
            container.setSlot("slotGrid" + i, 0, 0, 0);
        }
    }
    container.sendChanges();
}

function onRecipeSlotClick(index, container) {
    debugLog("onRecipeSlotClick: index=" + index + " cached=" + _cachedRecipes.length);
    if (index >= _cachedRecipes.length) { debugLog("  index out of range"); return; }
    if (!container) { debugLog("  no container"); return; }

    var recipe = _cachedRecipes[index];
    debugLog("  selected: result id=" + (recipe.getResult() ? recipe.getResult().id : "null"));

    container.sendEvent("selectRecipe", { index: index });
}
