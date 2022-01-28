"use strict"

import {getColorForDistanceAndToken, getMovedDistanceFromToken, getRangesFromSpeedProvider, initApi, registerModule, registerSystem} from "./api.js";
import {checkDependencies, getHexSizeSupportTokenGridCenter} from "./compatibility.js";
import {moveEntities, onMouseMove} from "./foundry_imports.js"
import {disableSnap, registerKeybindings} from "./keybindings.js";
import {libWrapper} from "./libwrapper_shim.js";
import {performMigrations} from "./migration.js"
import {removeLastHistoryEntryIfAt, resetMovementHistory} from "./movement_tracking.js";
import { initializePathfinding } from "./pathfinding.js";
import {extendRuler} from "./ruler.js";
import {registerSettings, RightClickAction, settingsKey} from "./settings.js"
import {recalculate} from "./socket.js";
import {SpeedProvider} from "./speed_provider.js"
import {setSnapParameterOnOptions} from "./util.js";

Hooks.once("init", () => {
	registerSettings()
	registerKeybindings()
	initApi()
	hookDragHandlers(Token);
	hookDragHandlers(MeasuredTemplate);
	libWrapper.register("drag-ruler", "TokenLayer.prototype.undoHistory", tokenLayerUndoHistory, "WRAPPER");

	extendRuler();

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
	initializePathfinding();
	performMigrations()
	checkDependencies();
	Hooks.callAll("dragRuler.ready", SpeedProvider)
})

Hooks.on("canvasReady", () => {
	canvas.controls.rulers.children.forEach(ruler => {
		ruler.draggedEntity = null;
		Object.defineProperty(ruler, "isDragRuler", {
			get: function isDragRuler() {
				return Boolean(this.draggedEntity) && this._state !== Ruler.STATES.INACTIVE;
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

function forwardIfUnahndled(newFn) {
	return function(oldFn, ...args) {
		const eventHandled = newFn(...args);
		if (!eventHandled)
			oldFn(...args);
	};
}

function hookDragHandlers(entityType) {
	const entityName = entityType.name
	libWrapper.register("drag-ruler", `${entityName}.prototype._onDragLeftStart`, onEntityLeftDragStart, "WRAPPER");
	if (entityType === Token)
		libWrapper.register("drag-ruler", `${entityName}.prototype._onDragLeftMove`, onEntityLeftDragMoveSnap, "WRAPPER");
	else
		libWrapper.register("drag-ruler", `${entityName}.prototype._onDragLeftMove`, onEntityLeftDragMove, "WRAPPER");
	libWrapper.register("drag-ruler", `${entityName}.prototype._onDragLeftDrop`, forwardIfUnahndled(onEntityDragLeftDrop), "MIXED");
	libWrapper.register("drag-ruler", `${entityName}.prototype._onDragLeftCancel`, forwardIfUnahndled(onEntityDragLeftCancel), "MIXED");
}

async function tokenLayerUndoHistory(wrapped) {
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

function onEntityLeftDragStart(wrapped, event) {
	wrapped(event);
	const isToken = this instanceof Token;
	const ruler = canvas.controls.ruler
	ruler.draggedEntity = this;
	let entityCenter;
	if (isToken && canvas.grid.isHex && game.modules.get("hex-size-support")?.active && CONFIG.hexSizeSupport.getAltSnappingFlag(this))
		entityCenter = getHexSizeSupportTokenGridCenter(this);
	else
		entityCenter = this.center;
	ruler.rulerOffset = {x: entityCenter.x - event.data.origin.x, y: entityCenter.y - event.data.origin.y};
	if (game.settings.get(settingsKey, "autoStartMeasurement")) {
		let options = {};
		setSnapParameterOnOptions(ruler, options);
		ruler.dragRulerStart(options, false);
	}
}

function onEntityLeftDragMoveSnap(wrapped, event) {
	applyGridlessSnapping.call(this, event);
	onEntityLeftDragMove.call(this, wrapped, event);
}

function onEntityLeftDragMove(wrapped, event) {
	wrapped(event);
	const ruler = canvas.controls.ruler
	if (ruler.isDragRuler)
		onMouseMove.call(ruler, event)
}

function onEntityDragLeftDrop(event) {
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
	ruler._state = Ruler.STATES.MOVING
	moveEntities.call(ruler, ruler.draggedEntity, selectedTokens);
	return true
}

function onEntityDragLeftCancel(event) {
	// This function is invoked by right clicking
	const ruler = canvas.controls.ruler
	if (!ruler.draggedEntity || ruler._state === Ruler.STATES.MOVING)
		return false

	const rightClickAction = game.settings.get(settingsKey, "rightClickAction");
	let options = {};
	setSnapParameterOnOptions(ruler, options);

	if (ruler._state === Ruler.STATES.INACTIVE) {
		if (rightClickAction !== RightClickAction.CREATE_WAYPOINT)
			return false;
		ruler.dragRulerStart(options);
		event.preventDefault();
	}
	else if (ruler._state === Ruler.STATES.MEASURING) {
		switch (rightClickAction) {
			case RightClickAction.CREATE_WAYPOINT:
				event.preventDefault();
				ruler.dragRulerAddWaypoint(ruler.destination, options);
				break;
			case RightClickAction.DELETE_WAYPOINT:
				ruler.dragRulerDeleteWaypoint(event, options);
				break;
			case RightClickAction.ABORT_DRAG:
				ruler.dragRulerAbortDrag();
				break;
		}
	}
	return true;
}

function applyGridlessSnapping(event) {
	const ruler = canvas.controls.ruler;
	if (!game.settings.get(settingsKey, "useGridlessRaster"))
		return;
	if (!ruler.isDragRuler)
		return;
	if (disableSnap)
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
