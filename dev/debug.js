var CONFIG = FileTools.ReadJSON(__dir__ + "config.json");
var DEBUG = CONFIG.dev === true;

function chatLog(msg) {
    if (!DEBUG) return;
    Game.message("[CraftingStation] " + msg);
}

function debugLog(msg) {
    if (!DEBUG) return;
    Logger.Log(msg, "CraftingStation");
}

function debugLog_chest(msg) {
    if (!DEBUG) return;
    Logger.Log("[CHEST] " + msg, "CraftingStation");
}

function debugLog_ui(msg) {
    if (!DEBUG) return;
    Logger.Log("[UI] " + msg, "CraftingStation");
}

function debugLog_event(msg) {
    if (!DEBUG) return;
    Logger.Log("[EVENT] " + msg, "CraftingStation");
}

function debugLog_anim(msg) {
    if (!DEBUG) return;
    Logger.Log("[ANIM] " + msg, "CraftingStation");
}

chatLog("[DEBUG] Mod loaded — dev mode active");
debugLog("Debug file loaded, config.dev = " + DEBUG);
