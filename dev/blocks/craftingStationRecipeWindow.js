// Recipe list panel — left side (250px)
// Provides functions to enumerate, filter, and select recipes

var recipeSlotSize = 80;
var recipeColumns = 2;
var recipeSlotPadding = 8;
var recipeStartX = 36;
var recipeStartY = 8;

var _cachedRecipes = [];
var totalRecipeSlots = 30;

// Set up recipe window content (called from craftingStation.js after window creation)
function setupRecipeWindow(recipeWin) {
    debugLog_ui("setupRecipeWindow called");
    var content = recipeWin.getContent();
    var el = content.elements;

    // Create clickable recipe slots (non-visual → can be clicked, but transfer policy rejects drops)
    for (var i = 0; i < totalRecipeSlots; i++) {
        var col = i % recipeColumns;
        var row = Math.floor(i / recipeColumns);
        var sx = recipeStartX + col * (recipeSlotSize + recipeSlotPadding);
        var sy = recipeStartY + row * (recipeSlotSize + recipeSlotPadding);

        (function(idx) {
            el["recipeSlot" + i] = {
                type: "slot",
                x: sx,
                y: sy,
                size: recipeSlotSize,
                clicker: {
                    onClick: function(container, window, element) {
                        onRecipeSlotClick(idx);
                    }
                }
            };
        })(i);
    }

    var totalRows = Math.ceil(totalRecipeSlots / recipeColumns);
    var totalHeight = totalRows * (recipeSlotSize + recipeSlotPadding) + recipeStartY;
    recipeWin.location.setScroll(0, Math.max(0, totalHeight - recipeWin.location.height));

    // Info text — always shown (recipe browser API not available in this Inner Core version)
    el["recipeInfoText"] = {
        type: "text",
        x: 5,
        y: totalHeight + 10,
        text: "Recipe list:\nAPI not available",
        font: { color: android.graphics.Color.GRAY, size: 12 }
    };

    recipeWin.forceRefresh();
    debugLog_ui("Recipe window setup done: " + totalRecipeSlots + " slots, scroll=" + (totalHeight - recipeWin.location.height));
}

// Check available items across grid + inventory + chests
function countAvailableItem(itemId, itemData, container) {
    var total = 0;
    for (var i = 0; i < 9; i++) {
        var slot = container.getSlot("slotGrid" + i);
        if (slot && slot.id == itemId && (slot.data == itemData || itemData == -1)) total += slot.count;
    }
    try {
        var player = new PlayerActor(Player.get());
        if (player) {
            for (var i = 0; i < 36; i++) {
                var invSlot = player.getInventorySlot(i);
                if (invSlot && invSlot.id == itemId && (invSlot.data == itemData || itemData == -1)) total += invSlot.count;
            }
        }
    } catch (e) {}
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

// Check if a recipe has any ingredient available
function recipeHasItem(recipe, container) {
    try {
        var entries = recipe.getEntries();
        if (!entries) return false;
        var iter = entries.iterator();
        while (iter.hasNext()) {
            var entry = iter.next();
            var eid = entry.getId();
            var edata = entry.getData();
            if (eid > 0 && countAvailableItem(eid, edata, container) > 0) return true;
        }
    } catch (e) { debugLog("recipeHasItem error: " + e); }
    return false;
}

// Try to get all workbench recipes (may not be available in all Inner Core versions)
function getAllWorkbenchRecipes() {
    // Try multiple approaches
    var approaches = [
        function() { return Recipes.getWorkbenchRecipes(); },
        function() { return Recipes.getWorkbenchRecipes ? Recipes.getWorkbenchRecipes() : null; },
        function() { return Recipes.workbench ? Recipes.workbench : null; },
        function() { return Recipes.getAllWorkbenchRecipes ? Recipes.getAllWorkbenchRecipes() : null; }
    ];
    for (var a = 0; a < approaches.length; a++) {
        try {
            var result = approaches[a]();
            if (result) {
                // Check if it's a Java Collection (has iterator + size())
                if (typeof result.iterator == "function") {
                    var arr = [];
                    var iter = result.iterator();
                    while (iter.hasNext()) arr.push(iter.next());
                    if (arr.length > 0) return arr;
                } else if (typeof result.length == "number" && result.length > 0) {
                    return result;
                } else if (typeof result.size == "function" && result.size() > 0) {
                    return result;
                }
            }
        } catch (e) { debugLog("getAllWorkbenchRecipes approach " + a + " failed: " + e); }
    }
    return null;
}

// Refresh recipe list (called from craftingStation.js click)
function refreshRecipeList(container) {
    debugLog_ui("refreshRecipeList called");

    var allRecipes = getAllWorkbenchRecipes();
    if (!allRecipes) {
        debugLog_ui("Recipe enumeration not available in this Inner Core version");
        for (var i = 0; i < totalRecipeSlots; i++) {
            container.setSlot("recipeSlot" + i, 0, 0, 0);
        }
        container.sendChanges();
        recipeWindow.forceRefresh();
        return;
    }

    var filtered = [];
    for (var r = 0; r < allRecipes.length; r++) {
        if (recipeHasItem(allRecipes[r], container)) {
            filtered.push(allRecipes[r]);
        }
    }
    _cachedRecipes = filtered;
    debugLog_ui("Recipes: " + allRecipes.length + " total, " + filtered.length + " available");

    var content = recipeWindow.getContent();
    var maxShow = Math.min(filtered.length, totalRecipeSlots);
    for (var i = 0; i < totalRecipeSlots; i++) {
        var slotName = "recipeSlot" + i;
        if (i < maxShow) {
            var result = filtered[i].getResult();
            container.setSlot(slotName, result ? result.id : 0, result ? result.count : 0, result ? result.data : 0, result ? result.extra || null : null);
        } else {
            container.setSlot(slotName, 0, 0, 0);
        }
    }
    container.sendChanges();
    recipeWindow.forceRefresh();
}

// Populate crafting grid from recipe
function populateGridFromRecipe(recipe, container) {
    if (!recipe) return;
    var result = recipe.getResult();
    debugLog_ui("populateGridFromRecipe: result=" + (result ? result.id : "null"));

    // Return existing grid items
    returnGridItems(container);

    // Fill grid with recipe
    var placed = 0;
    try {
        var entries = recipe.getSortedEntries();
        for (var i = 0; i < 9; i++) {
            var entry = entries[i];
            if (entry && entry.getId() > 0) {
                var eid = entry.getId();
                var edata = entry.getData();
                var avail = countAvailableItem(eid, edata, container);
                var count = Math.min(avail, entry.getCount());
                debugLog_ui("  slotGrid" + i + ": id=" + eid + " count=" + count + " avail=" + avail + " need=" + entry.getCount());
                container.setSlot("slotGrid" + i, eid, count, edata > -1 ? edata : 0);
                if (count > 0) placed++;
            } else {
                container.setSlot("slotGrid" + i, 0, 0, 0);
            }
        }
    } catch (e) { debugLog("populateGridFromRecipe error: " + e); }
    container.sendChanges();
    debugLog_ui("populateGridFromRecipe done: " + placed + " slots with items");
}

// Return grid items to player inventory
function returnGridItems(container) {
    for (var i = 0; i < 9; i++) {
        var slot = container.getSlot("slotGrid" + i);
        if (slot && slot.id > 0 && slot.count > 0) {
            try {
                var player = new PlayerActor(Player.get());
                player.addItemToInventory(slot.id, slot.count, slot.data, slot.extra || null, true);
            } catch (e) { debugLog("returnGridItems error: " + e); }
            container.setSlot("slotGrid" + i, 0, 0, 0);
        }
    }
    container.sendChanges();
}

// Handle recipe slot click
function onRecipeSlotClick(index) {
    debugLog_ui("onRecipeSlotClick: index=" + index + " cachedRecipes.length=" + _cachedRecipes.length);
    if (index >= _cachedRecipes.length) { debugLog("  index out of range"); return; }
    var container = chestData && chestData.container;
    if (!container) { debugLog("  no container (chestData unavailable)"); return; }
    debugLog("  chestData.container=" + (container ? "valid" : "null"));

    var recipe = _cachedRecipes[index];
    var result = recipe.getResult();
    debugLog_ui("  selected recipe: result id=" + (result ? result.id : "null") + " uid=" + (recipe.getRecipeUid ? recipe.getRecipeUid() : "?"));
    populateGridFromRecipe(recipe, container);
    updateResultSlot(container);
    debugLog_ui("onRecipeSlotClick done");
}
