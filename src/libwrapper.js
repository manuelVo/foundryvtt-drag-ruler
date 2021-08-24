// Hooks using libWrapper
import { onEntityLeftDragStart,
         onEntityLeftDragMove,
         onEntityDragLeftDrop,
         onEntityDragLeftCancel,
         handleKeys } from "./main.js";

import { removeLastHistoryEntryIfAt } from "./movement_tracking.js";
export const MODULE_ID = "drag-ruler";
import { settingsKey } from "./settings.js"

export function registerLibWrapper() {
  libWrapper.register(settingsKey, "Token.prototype._onDragLeftStart", onTokenLeftDragStartWrap, "WRAPPER");
  libWrapper.register(settingsKey, "Token.prototype._onDragLeftMove", onDragLeftMoveWrap, "WRAPPER");
  libWrapper.register(settingsKey, "Token.prototype._onDragLeftDrop", onDragLeftDropWrap, "MIXED");
  libWrapper.register(settingsKey, "Token.prototype._onDragLeftCancel", onDragLeftCancelWrap, "MIXED");

  libWrapper.register(settingsKey, "KeyboardManager.prototype._handleKeys", handleKeysWrap, "MIXED");

  libWrapper.register(settingsKey, "TokenLayer.prototype.undoHistory", dragRulerUndoHistory, "WRAPPER");
}

// simple wraps to keep the original functionality when not using libWrapper
function onTokenLeftDragStartWrap(wrapped, event) {
  wrapped(event);
  onEntityLeftDragStart.call(this, event);
}

function onDragLeftMoveWrap(wrapped, event) {
  wrapped(event);
  onEntityLeftDragMove.call(this, event);
}

function onDragLeftDropWrap(wrapped, event) {
  const eventHandled = onEntityDragLeftDrop.call(this, event);
  if(!eventHandled) {
    wrapped(event);
  }
}

function onDragLeftCancelWrap(wrapped, event) {
  const eventHandled = onEntityDragLeftCancel.call(this, event);
  if(!eventHandled) {
    wrapped(event);
  }
}

function handleKeysWrap(wrapped, event, key, up) {
  const eventHandled = handleKeys.call(this, event, key, up);
  if(!eventHandled) {
    wrapped(event, key, up);
  }
}

async function dragRulerUndoHistory(wrapped) {
  const historyEntry = this.history[this.history.length - 1];
  const returnValue = await wrapped();

  if (historyEntry.type === "update") {
    for (const entry of historyEntry.data) {
      const token = canvas.tokens.get(entry._id);
      removeLastHistoryEntryIfAt(token, entry.x, entry.y);
    }
  }
  return returnValue;
}

