// Hooks using libWrapper
import { onTokenLeftDragStart,
         onTokenLeftDragMove,
         onTokenDragLeftDrop,
         onTokenDragLeftCancel,
         handleKeys } from "./main.js";

export const MODULE_ID = "drag-ruler";

export function registerLibWrapper() {
  libWrapper.register(MODULE_ID, "Token.prototype._onDragLeftStart", onTokenLeftDragStartWrap, "WRAPPER");
  libWrapper.register(MODULE_ID, "Token.prototype._onDragLeftMove", onDragLeftMoveWrap, "WRAPPER");
  libWrapper.register(MODULE_ID, "Token.prototype._onDragLeftDrop", onDragLeftDropWrap, "MIXED");
  libWrapper.register(MODULE_ID, "Token.prototype._onDragLeftCancel", onDragLeftCancelWrap, "MIXED");

  libWrapper.register(MODULE_ID, "KeyboardManager.prototype._handleKeys", handleKeysWrap, "MIXED");
}

// simple wraps to keep the original functionality when not using libWrapper
function onTokenLeftDragStartWrap(wrapped, event) {
  wrapped(event);
  onTokenLeftDragStart.call(this, event);
}

function onDragLeftMoveWrap(wrapped, event) {
  wrapped(event);
  onTokenLeftDragMove.call(this, event);
}

function onDragLeftDropWrap(wrapped, event) {
  const eventHandled = onTokenDragLeftDrop.call(this, event);
  if(!eventHandled) {
    wrapped(event);
  }
}

function onDragLeftCancelWrap(wrapped, event) {
  const eventHandled = onTokenDragLeftCancel.call(this, event);
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
