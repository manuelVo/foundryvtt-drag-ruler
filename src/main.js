"use strict"

import {currentSpeedProvider, getColorForDistanceAndToken, getMovedDistanceFromToken, getRangesFromSpeedProvider, initApi, registerModule, registerSystem} from "./api.js";
import {checkDependencies, getHexSizeSupportTokenGridCenter, highlightMeasurementTerrainRuler} from "./compatibility.js";
import {moveEntities, onMouseMove} from "./foundry_imports.js"
import {performMigrations} from "./migration.js"
import {DragRulerRuler} from "./ruler.js";
import {getMovementHistory, removeLastHistoryEntryIfAt, resetMovementHistory} from "./movement_tracking.js";
import {registerSettings, settingsKey} from "./settings.js"
import {recalculate} from "./socket.js";
import {SpeedProvider} from "./speed_provider.js"
import {registerLibWrapper, MODULE_ID} from "./libwrapper.js"
import {registerLibRuler, log} from "./libruler.js"
import {isClose, setSnapParameterOnOptions} from "./util.js";

Hooks.once("init", () => {
	registerSettings()
	initApi()
	hookDragHandlers(Token);
	hookDragHandlers(MeasuredTemplate);
	hookKeyboardManagerFunctions()
	hookLayerFunctions();

        if(!game.modules.get('lib-wrapper')?.active) {
	  hookTokenDragHandlers()
	  hookKeyboardManagerFunctions()
        } else {
          registerLibWrapper();
        }
  if(!game.modules.get('libruler')?.active)	Ruler = DragRulerRuler;

	window.dragRuler = {
		getColorForDistanceAndToken,
		getMovedDistanceFromToken,
		registerModule,
		registerSystem,
		recalculate,
		resetMovementHistory,
	}
})

Hooks.once("ready", () => {
	performMigrations()
	checkDependencies();
	Hooks.callAll("dragRuler.ready", SpeedProvider)
})

Hooks.on("canvasReady", () => {
  if(!game.modules.get('libruler')?.active)) {
	canvas.controls.rulers.children.forEach(ruler => {
		ruler.draggedEntity = null;
		Object.defineProperty(ruler, "isDragRuler", {
			get: function isDragRuler() {
				return Boolean(this.draggedEntity) && this._state !== Ruler.STATES.INACTIVE;
			}
			})
		})
	}
})

Hooks.on("getCombatTrackerEntryContext", function (html, menu) {
	const entry = {
		name: "drag-ruler.resetMovementHistory",
		icon: '<i class="fas fa-undo-alt"></i>',
		callback: li => resetMovementHistory(ui.combat.viewed, li.data('combatant-id')),
	};
	menu.splice(1, 0, entry);
});

Hooks.once('libRulerReady', async function() {
  registerLibRuler();
});

function hookDragHandlers(entityType) {
	const originalDragLeftStartHandler = entityType.prototype._onDragLeftStart
	entityType.prototype._onDragLeftStart = function(event) {
		originalDragLeftStartHandler.call(this, event)
		onEntityLeftDragStart.call(this, event)
	}

	const originalDragLeftMoveHandler = entityType.prototype._onDragLeftMove
	entityType.prototype._onDragLeftMove = function (event) {
		if (entityType === Token)
			applyGridlessSnapping.call(this, event);
		originalDragLeftMoveHandler.call(this, event)
		onEntityLeftDragMove.call(this, event)
	}

	const originalDragLeftDropHandler = entityType.prototype._onDragLeftDrop
	entityType.prototype._onDragLeftDrop = function (event) {
		const eventHandled = onEntityDragLeftDrop.call(this, event)
		if (!eventHandled)
			originalDragLeftDropHandler.call(this, event)
	}

	const originalDragLeftCancelHandler = entityType.prototype._onDragLeftCancel
	entityType.prototype._onDragLeftCancel = function (event) {
		const eventHandled = onEntityDragLeftCancel.call(this, event)
		if (!eventHandled)
			originalDragLeftCancelHandler.call(this, event)
	}
}

function hookKeyboardManagerFunctions() {
	const originalHandleKeys = KeyboardManager.prototype._handleKeys
	KeyboardManager.prototype._handleKeys = function (event, key, up) {
		const eventHandled = handleKeys.call(this, event, key, up)
		if (!eventHandled)
			originalHandleKeys.call(this, event, key, up)
	}
}

function hookLayerFunctions() {
	const originalTokenLayerUndoHistory = TokenLayer.prototype.undoHistory;
	TokenLayer.prototype.undoHistory = function () {
		const historyEntry = this.history[this.history.length - 1];
		return originalTokenLayerUndoHistory.call(this).then((returnValue) => {
			if (historyEntry.type === "update") {
				for (const entry of historyEntry.data) {
					const token = canvas.tokens.get(entry._id);
					removeLastHistoryEntryIfAt(token, entry.x, entry.y);
				}
			}
			return returnValue;
		});
	}
}

export function handleKeys(event, key, up) {
	if (event.repeat || this.hasFocus)
		return false

	const lowercaseKey = key.toLowerCase();

	if (lowercaseKey === "x") return onKeyX(up)
	if (lowercaseKey === "shift") return onKeyShift(up)
	if (lowercaseKey === "space") return onKeySpace(up);
	if (lowercaseKey === "escape") return onKeyEscape(up);
	return false
}

function onKeyX(up) {
  log(`onKeyX ${up}`);
	if (up)
		return false
	const ruler = canvas.controls.ruler;
	if (!ruler.isDragRuler)
		return false

	ruler.dragRulerDeleteWaypoint();
	return true
}

function onKeyShift(up) {
  log(`onKeyShift ${up}`);
	const ruler = canvas.controls.ruler
	if (!ruler.isDragRuler)
		return false
	if (ruler._state !== Ruler.STATES.MEASURING)
		return false;

	const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens)
	const rulerOffset = ruler.rulerOffset
	const measurePosition = {x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y}

  if(game.modules.get('lib-wrapper')?.active) {
    ruler.setFlag(MODULE_ID, "snap", up);
  }
	ruler.measure(measurePosition, {snap: up})
}

function onKeySpace(up) {
	const ruler = canvas.controls.ruler;
	// Ruler can end up being undefined here if no canvas is active
	if (!ruler?.draggedEntity)
		return false;

	if (ruler._state !== Ruler.STATES.INACTIVE)
		return false;

	const swapSpacebarRightClick = game.settings.get(settingsKey, "swapSpacebarRightClick");
	let options = {};
	setSnapParameterOnOptions(ruler, options);

	if (!up) {
		if (swapSpacebarRightClick)
			ruler.dragRulerAbortDrag();
		else
			startDragRuler.call(ruler.draggedEntity, options);
	}
	return true;
}

function onKeyEscape(up) {
	const ruler = canvas.controls.ruler;
	if (!ruler.draggedEntity)
		return false;
	if (!up)
		ruler.dragRulerAbortDrag();
	return true;
}

function onEntityLeftDragStart(event) {
  log(`onTokenLeftDragStart`, event);
	const isToken = this instanceof Token;
	if (!currentSpeedProvider.usesRuler(this))
		return
	const ruler = canvas.controls.ruler

	if(game.modules.get('libruler')?.active) {
    log(`token id is ${this.id}`, this);
    ruler.setFlag(MODULE_ID, "draggedTokenID", this.id);
    log(`Set draggedTokenID. Ruler isDragRuler? ${ruler.isDragRuler}`, ruler);
	} else {
	ruler.draggedEntity = this;
	}
	let entityCenter;
	if (isToken && canvas.grid.isHex && game.modules.get("hex-size-support")?.active && CONFIG.hexSizeSupport.getAltSnappingFlag(this))
		entityCenter = getHexSizeSupportTokenGridCenter(this);
	else
		entityCenter = this.center;
	ruler.rulerOffset = {x: entityCenter.x - event.data.origin.x, y: entityCenter.y - event.data.origin.y};
	if (game.settings.get(settingsKey, "autoStartMeasurement")) {
		let options = {};
		setSnapParameterOnOptions(ruler, options);
		startDragRuler.call(this, options, false);
	}
}

function startDragRuler(options, measureImmediately=true) {
	const isToken = this instanceof Token;
	if (isToken && !currentSpeedProvider.usesRuler(this))
		return;
	const ruler = canvas.controls.ruler;
	ruler.clear();
	ruler._state = Ruler.STATES.STARTING;

	const rulerOffset = {x: tokenCenter.x - event.data.origin.x, y: tokenCenter.y - event.data.origin.y}
	if(game.modules.get('libruler')?.active) {
	  ruler.setFlag(MODULE_ID, "rulerOffset", rulerOffset);
	} else {
	  ruler.rulerOffset = rulerOffset
	}


	if (game.settings.get(settingsKey, "enableMovementHistory"))
		ruler.dragRulerAddWaypointHistory(getMovementHistory(this))

        if(game.modules.get('libruler')?.active) {
          ruler._addWaypoint(tokenCenter, false);
        } else {
	let entityCenter;
	if (isToken && canvas.grid.isHex && game.modules.get("hex-size-support")?.active && CONFIG.hexSizeSupport.getAltSnappingFlag(this))
		entityCenter = getHexSizeSupportTokenGridCenter(this);
	else
		entityCenter = this.center;
	if (isToken && game.settings.get(settingsKey, "enableMovementHistory"))
		ruler.dragRulerAddWaypointHistory(getMovementHistory(this));
	ruler.dragRulerAddWaypoint(entityCenter, {snap: false});
	const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens);
	const destination = {x: mousePosition.x + ruler.rulerOffset.x, y: mousePosition.y + ruler.rulerOffset.y};
	if (measureImmediately)
		ruler.measure(destination, options);
        }
}

function onEntityLeftDragMove(event) {
  log(`onTokenLeftDragMove`, event);
	const ruler = canvas.controls.ruler
	if (ruler.isDragRuler) {
	  if(game.modules.get('libruler')?.active) {
	    ruler._onMouseMove(event);
	  } else {
	    onMouseMove.call(ruler, event)
	  }
	}
}

function onEntityDragLeftDrop(event) {
  log(`onTokenDragLeftDrop`, event);
	const ruler = canvas.controls.ruler
	if (!ruler.isDragRuler) {
		ruler.draggedEntity = undefined;
		return false
	}
	// When we're dragging a measured template no token will ever be selected,
	// resulting in only the dragged template to be moved as would be expected
	const selectedTokens = canvas.tokens.controlled
	// This can happen if the user presses ESC during drag (maybe there are other ways too)
	if (selectedTokens.length === 0)
		selectedTokens.push(ruler.draggedEntity);

	if(game.modules.get('libruler')?.active) {
	  ruler._onMouseMove(event);
	} else {
	  onMouseMove.call(ruler, event);
	}


	ruler._state = Ruler.STATES.MOVING
	moveEntities.call(ruler, ruler.draggedEntity, selectedTokens);

	if(game.modules.get('libruler')?.active) {
	  ruler.moveToken();
	} else {
	  const selectedTokens = canvas.tokens.controlled
	  moveTokens.call(ruler, ruler.draggedToken, selectedTokens)
	}

	return true
}

function onEntityDragLeftCancel(event) {
  log(`onTokenDragLeftCancel`, event);
	// This function is invoked by right clicking
	const ruler = canvas.controls.ruler
	if (!ruler.draggedEntity || ruler._state === Ruler.STATES.MOVING)
		return false

	const swapSpacebarRightClick = game.settings.get(settingsKey, "swapSpacebarRightClick");
	let options = {};
	setSnapParameterOnOptions(ruler, options);

	if (ruler._state === Ruler.STATES.INACTIVE) {
		if (!swapSpacebarRightClick)
			return false;
		startDragRuler.call(this, options);
		event.preventDefault();
	}
	else if (ruler._state === Ruler.STATES.MEASURING) {
		if (!swapSpacebarRightClick) {
			ruler.dragRulerDeleteWaypoint(event, options);
		}
		else {
			event.preventDefault();
			ruler.dragRulerAddWaypoint(ruler.destination, options);
		}
	}
	return true
}

function applyGridlessSnapping(event) {
	const ruler = canvas.controls.ruler;
	if (!game.settings.get(settingsKey, "useGridlessRaster"))
		return;
	if (!ruler.isDragRuler)
		return;
	if (game.keyboard.isDown("Shift"))
		return;
	if (canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS)
		return;

	const rasterWidth = 35 / canvas.stage.scale.x;
	const tokenX = event.data.destination.x;
	const tokenY = event.data.destination.y;
	const destination = {x: tokenX + ruler.rulerOffset.x, y: tokenY + ruler.rulerOffset.y};
	const ranges = getRangesFromSpeedProvider(ruler.draggedEntity);

	const terrainRulerAvailable = game.modules.get("terrain-ruler")?.active;
	if (terrainRulerAvailable) {
		const segments = Ruler.dragRulerGetRaysFromWaypoints(ruler.waypoints, destination).map(ray => {return {ray}});
		const pinpointDistances = new Map();
		for (const range of ranges) {
			pinpointDistances.set(range.range, null);
		}
		terrainRuler.measureDistances(segments, {pinpointDistances});
		const targetDistance = Array.from(pinpointDistances.entries())
			.filter(([_key, val]) => val)
			.reduce((value, current) => value[0] > current[0] ? value : current, [0, null]);
		const rasterLocation = targetDistance[1];
		if (rasterLocation) {
			const deltaX = destination.x - rasterLocation.x;
			const deltaY = destination.y - rasterLocation.y;
			const rasterDistance = Math.hypot(deltaX, deltaY);
			if (rasterDistance < rasterWidth) {
				event.data.destination.x = rasterLocation.x - ruler.rulerOffset.x;
				event.data.destination.y = rasterLocation.y - ruler.rulerOffset.y;
			}
		}
	}
	else {
		let waypointDistance = 0;
		let origin = event.data.origin;
		if (ruler.waypoints.length > 1) {
			const segments = Ruler.dragRulerGetRaysFromWaypoints(ruler.waypoints, destination).map(ray => {return {ray}});
			origin = segments.pop().ray.A;
			waypointDistance = canvas.grid.measureDistances(segments).reduce((a, b) => a + b);
			origin = {x: origin.x - ruler.rulerOffset.x, y: origin.y - ruler.rulerOffset.y};
		}

		const deltaX = tokenX - origin.x;
		const deltaY = tokenY - origin.y;
		const distance = Math.hypot(deltaX, deltaY);
		// targetRange will be the largest range that's still smaller than distance
		let targetDistance = ranges
			.map(range => range.range)
			.map(range => range - waypointDistance)
			.map(range => range * canvas.dimensions.size / canvas.dimensions.distance)
			.filter(range => range < distance)
			.reduce((a, b) => Math.max(a, b), 0);
		if (targetDistance) {
			if (distance < targetDistance + rasterWidth) {
				event.data.destination.x = origin.x + deltaX * targetDistance / distance;
				event.data.destination.y = origin.y + deltaY * targetDistance / distance;
			}
		}
	}
}
