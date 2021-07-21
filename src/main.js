"use strict"

import {currentSpeedProvider, getMovedDistanceFromToken, getRangesFromSpeedProvider, getUnreachableColorFromSpeedProvider, initApi, registerModule, registerSystem} from "./api.js"
import {checkDependencies, getHexSizeSupportTokenGridCenter} from "./compatibility.js";
import {moveEntities, onMouseMove} from "./foundry_imports.js"
import {performMigrations} from "./migration.js"
import {DragRulerRuler} from "./ruler.js";
import {getMovementHistory, resetMovementHistory} from "./movement_tracking.js";
import {registerSettings, settingsKey} from "./settings.js"
import {recalculate} from "./socket.js";
import {SpeedProvider} from "./speed_provider.js"

Hooks.once("init", () => {
	registerSettings()
	initApi()
	hookDragHandlers(Token);
	hookDragHandlers(MeasuredTemplate);
	hookKeyboardManagerFunctions()

	Ruler = DragRulerRuler;

	window.dragRuler = {
		getColorForDistance,
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
	canvas.controls.rulers.children.forEach(ruler => {
		ruler.draggedEntity = null;
		Object.defineProperty(ruler, "isDragRuler", {
			get: function isDragRuler() {
				return Boolean(this.draggedEntity); // If draggedEntity is set this is a drag ruler
			}
		})
	})
})

Hooks.on("getCombatTrackerEntryContext", function (html, menu) {
	const entry = {
		name: "drag-ruler.resetMovementHistory",
		icon: '<i class="fas fa-undo-alt"></i>',
		callback: li => resetMovementHistory(ui.combat.viewed, li.data('combatant-id')),
	};
	menu.splice(1, 0, entry);
});

function hookDragHandlers(entityType) {
	const originalDragLeftStartHandler = entityType.prototype._onDragLeftStart
	entityType.prototype._onDragLeftStart = function(event) {
		originalDragLeftStartHandler.call(this, event)
		onEntityLeftDragStart.call(this, event)
	}

	const originalDragLeftMoveHandler = entityType.prototype._onDragLeftMove
	entityType.prototype._onDragLeftMove = function (event) {
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

function handleKeys(event, key, up) {
	if (event.repeat || this.hasFocus)
		return false

	if (key.toLowerCase() === "x") return onKeyX(up)
	if (key.toLowerCase() === "shift") return onKeyShift(up)
	return false
}

function onKeyX(up) {
	if (up)
		return false
	const ruler = canvas.controls.ruler;
	if (!ruler.isDragRuler)
		return false

	ruler.dragRulerDeleteWaypoint();
	return true
}

function onKeyShift(up) {
	const ruler = canvas.controls.ruler
	if (!ruler.isDragRuler)
		return false
	if (ruler._state !== Ruler.STATES.MEASURING)
		return false;

	const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens)
	const rulerOffset = ruler.rulerOffset
	const measurePosition = {x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y}
	ruler.measure(measurePosition, {snap: up})
}

function onEntityLeftDragStart(event) {
	const isToken = this instanceof Token;
	if (isToken && !currentSpeedProvider.usesRuler(this))
		return
	const ruler = canvas.controls.ruler
	ruler.draggedEntity = this;
	let entityCenter;
	if (isToken && canvas.grid.isHex && game.modules.get("hex-size-support")?.active && CONFIG.hexSizeSupport.getAltSnappingFlag(this))
		entityCenter = getHexSizeSupportTokenGridCenter(this);
	else
		entityCenter = this.center;
	ruler.clear();
	ruler._state = Ruler.STATES.STARTING;
	ruler.rulerOffset = {x: entityCenter.x - event.data.origin.x, y: entityCenter.y - event.data.origin.y};
	if (isToken && game.settings.get(settingsKey, "enableMovementHistory"))
		ruler.dragRulerAddWaypointHistory(getMovementHistory(this));
	ruler.dragRulerAddWaypoint(entityCenter, {snap: false});
}

function onEntityLeftDragMove(event) {
	const ruler = canvas.controls.ruler
	if (ruler.isDragRuler)
		onMouseMove.call(ruler, event)
}

function onEntityDragLeftDrop(event) {
	const ruler = canvas.controls.ruler
	if (!ruler.isDragRuler)
		return false
	// When we're dragging a measured template no token will ever be selected,
	// resulting in only the dragged template to be moved as would be expected
	const selectedTokens = canvas.tokens.controlled
	// This can happen if the user presses ESC during drag (maybe there are other ways too)
	if (selectedTokens.length === 0)
		selectedTokens.push(ruler.draggedEntity);
	ruler._state = Ruler.STATES.MOVING
	moveEntities.call(ruler, ruler.draggedEntity, selectedTokens);
	return true
}

function onEntityDragLeftCancel(event) {
	// This function is invoked by right clicking
	const ruler = canvas.controls.ruler
	if (!ruler.isDragRuler || ruler._state === Ruler.STATES.MOVING)
		return false
	if (ruler._state === Ruler.STATES.MEASURING) {
		let options = {};
		options.snap = !event.shiftKey;
		if(this.toggleSnapToGridData) { // toggleSnapToGridData is set in the 'Toggle Snap to Grid' module
			options.toggleSnapToGridActive = this.toggleSnapToGridData.toggleSnapToGridActive;
			this.toggleSnapToGridData = undefined; // remove it to prevent any lingering data issues
		}

		if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
			ruler.dragRulerDeleteWaypoint(event, options);
		}
		else {
			event.preventDefault();
			ruler.dragRulerAddWaypoint(ruler.destination, options);
		}
	}
	return true
}

export function getColorForDistance(startDistance, subDistance=0) {
	if (!this.isDragRuler)
		return this.color
	if (!this.draggedEntity.actor) {
		return this.color;
	}
	// Don't apply colors if the current user doesn't have at least observer permissions
	if (this.draggedEntity.actor.permission < 2) {
		// If this is a pc and alwaysShowSpeedForPCs is enabled we show the color anyway
		if (!(this.draggedEntity.actor.data.type === "character" && game.settings.get(settingsKey, "alwaysShowSpeedForPCs")))
			return this.color
	}
	const distance = startDistance + subDistance
	if (!this.dragRulerRanges)
		this.dragRulerRanges = getRangesFromSpeedProvider(this.draggedEntity);
	const ranges = this.dragRulerRanges;
	if (ranges.length === 0)
		return this.color
	const currentRange = ranges.reduce((minRange, currentRange) => {
		if (distance <= currentRange.range && currentRange.range < minRange.range)
			return currentRange
		return minRange
	}, {range: Infinity, color: getUnreachableColorFromSpeedProvider()})
	return currentRange.color
}
