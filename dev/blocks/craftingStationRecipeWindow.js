// Recipe list panel — left side (240px)
// Shows ALL recipe results, darkens unavailable ones (Refined Storage pattern)

var recipeSlotSize = 72;
var recipeColumns = 3;
var recipeSlotPadding = 6;
var recipeStartX = 10;
var recipeStartY = 8;

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

    // Run in background thread (Refined Storage pattern)
    var thread = java.lang.Thread({
        run: function() {
            try {
                var totalToShow = Math.min(allRecipes.length, totalRecipeSlots);
                var darkenMap = {};

                // Show first N recipes, check craftable status
                for (var r = 0; r < totalToShow; r++) {
                    var recipe = allRecipes[r];
                    var result = recipe.getResult();
                    if (result) {
                        container.setSlot("recipeSlot" + r, result.id, result.count, result.data, result.extra || null);
                    } else {
                        container.setSlot("recipeSlot" + r, 0, 0, 0);
                    }
                    darkenMap["recipeSlot" + r] = !isRecipeCraftable(recipe, container, playerUid);
                    if (r % 50 == 0) java.lang.Thread.yield();
                }

                // Clear remaining slots
                for (var r = totalToShow; r < totalRecipeSlots; r++) {
                    container.setSlot("recipeSlot" + r, 0, 0, 0);
                }

                _cachedRecipes = allRecipes.slice(0, totalToShow);
                _recipeDarkenMap = darkenMap;
                container.sendChanges();

                // Apply darken on main thread
                UI.getContext().runOnUiThread(new java.lang.Runnable({
                    run: function() {
                        for (var key in darkenMap) {
                            if (recipeWindowElements[key]) {
                                recipeWindowElements[key].darken = darkenMap[key];
                            }
                        }
                        recipeWindow.forceRefresh();
                        debugLog("refreshRecipeList: " + totalToShow + " recipes shown, " + Object.keys(darkenMap).filter(function(k) { return darkenMap[k]; }).length + " darkened");
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

// Populate crafting grid from recipe
function populateGridFromRecipe(recipe, container) {
    if (!recipe) return;
    var result = recipe.getResult();
    debugLog("populateGridFromRecipe: result=" + (result ? result.id : "null"));

    returnGridItems(container);

    var placed = 0;
    try {
        var entries = recipe.getSortedEntries();
        for (var i = 0; i < 9; i++) {
            var entry = entries[i];
            if (entry && entry.id > 0) {
                var eid = entry.id;
                var edata = entry.data;
                var need = entry.count || 1;
                var avail = countAvailableItem(eid, edata, container, Player.get());
                var count = Math.min(avail, need);
                container.setSlot("slotGrid" + i, eid, count, edata > -1 ? edata : 0);
                if (count > 0) placed++;
            } else {
                container.setSlot("slotGrid" + i, 0, 0, 0);
            }
        }
    } catch (e) { debugLog("populateGridFromRecipe error: " + e); }
    container.sendChanges();
    debugLog("populateGridFromRecipe done: " + placed + " slots with items");
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
    populateGridFromRecipe(recipe, container);
    updateResultSlot(container);
}
