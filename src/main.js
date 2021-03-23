"use strict"

import {currentSpeedProvider, getRangesFromSpeedProvider, getUnreachableColorFromSpeedProvider, initApi, registerModule, registerSystem} from "./api.js"
import {getHexSizeSupportTokenGridCenter} from "./compatibility.js"
import {measure, moveTokens, onMouseMove} from "./foundry_imports.js"
import {performMigrations} from "./migration.js"
import {registerSettings, settingsKey} from "./settings.js"
import {SpeedProvider} from "./speed_provider.js"
import { getSnapPointForToken } from "./util.js"

Hooks.once("init", () => {
	registerSettings()
	initApi()
	hookTokenDragHandlers()
	hookRulerFunctions()
	hookKeyboardManagerFunctions()

	window.dragRuler = {
		getColorForDistance,
		registerModule,
		registerSystem,
	}
})

Hooks.once("ready", () => {
	performMigrations()
	Hooks.callAll("dragRuler.ready", SpeedProvider)
})

Hooks.on("canvasReady", () => {
	canvas.controls.rulers.children.forEach(ruler => {
		ruler.draggedToken = null
		Object.defineProperty(ruler, "isDragRuler", {
			get: function isDragRuler() {
				return Boolean(this.draggedToken) // If draggedToken is set this is a drag ruler
			}
		})
	})
})

function hookTokenDragHandlers() {
	const originalDragLeftStartHandler = Token.prototype._onDragLeftStart
	Token.prototype._onDragLeftStart = function(event) {
		originalDragLeftStartHandler.call(this, event)
		onTokenLeftDragStart.call(this, event)
	}

	const originalDragLeftMoveHandler = Token.prototype._onDragLeftMove
	Token.prototype._onDragLeftMove = function (event) {
		originalDragLeftMoveHandler.call(this, event)
		onTokenLeftDragMove.call(this, event)
	}

	const originalDragLeftDropHandler = Token.prototype._onDragLeftDrop
	Token.prototype._onDragLeftDrop = function (event) {
		const eventHandled = onTokenDragLeftDrop.call(this, event)
		if (!eventHandled)
			originalDragLeftDropHandler.call(this, event)
	}

	const originalDragLeftCancelHandler = Token.prototype._onDragLeftCancel
	Token.prototype._onDragLeftCancel = function (event) {
		const eventHandled = onTokenDragLeftCancel.call(this, event)
		if (!eventHandled)
			originalDragLeftCancelHandler.call(this, event)
	}
}

function hookRulerFunctions() {
	const originalMoveTokenHandler = Ruler.prototype.moveToken
	Ruler.prototype.moveToken = function (event) {
		const eventHandled = onRulerMoveToken.call(this, event)
		if (!eventHandled)
			return originalMoveTokenHandler.call(this, event)
		return true
	}

	const originalToJSON = Ruler.prototype.toJSON
	Ruler.prototype.toJSON = function () {
		const json = originalToJSON.call(this)
		if (this.draggedToken)
			json["draggedToken"] = this.draggedToken.data._id
		return json
	}

	const originalUpdate = Ruler.prototype.update
	Ruler.prototype.update = function (data) {
		// Don't show a GMs drag ruler to non GM players
		if (data.draggedToken && this.user.isGM && !game.user.isGM && !game.settings.get(settingsKey, "showGMRulerToPlayers"))
			return
		if (data.draggedToken) {
			this.draggedToken = canvas.tokens.get(data.draggedToken)
		}
		originalUpdate.call(this, data)
	}

	const originalMeasure = Ruler.prototype.measure
	Ruler.prototype.measure = function (destination, options={}) {
		if (this.isDragRuler) {
			return measure.call(this, destination, options)
		}
		else {
			return originalMeasure.call(this, destination, options)
		}
	}

	const originalEndMeasurement = Ruler.prototype._endMeasurement
	Ruler.prototype._endMeasurement = function () {
		originalEndMeasurement.call(this)
		this.draggedToken = null
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
	if (!canvas.controls.ruler.isDragRuler)
		return false

	deleteWaypoint()
	return true
}

function onKeyShift(up) {
	const ruler = canvas.controls.ruler
	if (!ruler.isDragRuler)
		return false

	const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens)
	const rulerOffset = ruler.rulerOffset
	const measurePosition = {x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y}
	ruler.measure(measurePosition, {snap: up})
}

function onTokenLeftDragStart(event) {
	if (!currentSpeedProvider.usesRuler(this))
		return
	const ruler = canvas.controls.ruler
	ruler.draggedToken = this
	let tokenCenter
	if (canvas.grid.isHex && game.modules.get("hex-size-support")?.active && CONFIG.hexSizeSupport.getAltSnappingFlag(this))
		tokenCenter = getHexSizeSupportTokenGridCenter(this)
	else
		tokenCenter = this.center
	ruler.clear();
	ruler._state = Ruler.STATES.STARTING;
	ruler.rulerOffset = {x: tokenCenter.x - event.data.origin.x, y: tokenCenter.y - event.data.origin.y}
	addWaypoint.call(ruler, tokenCenter, false)
}

function onTokenLeftDragMove(event) {
	const ruler = canvas.controls.ruler
	if (ruler.isDragRuler)
		onMouseMove.call(ruler, event)
}

function onTokenDragLeftDrop(event) {
	const ruler = canvas.controls.ruler
	if (!ruler.isDragRuler)
		return false
	const selectedTokens = canvas.tokens.controlled
	ruler._state = Ruler.STATES.MOVING
	moveTokens.call(ruler, ruler.draggedToken, selectedTokens)
	return true
}

function onTokenDragLeftCancel(event) {
	// This function is invoked by right clicking
	const ruler = canvas.controls.ruler
	if (!ruler.isDragRuler || ruler._state === Ruler.STATES.MOVING)
		return false
	if (ruler._state === Ruler.STATES.MEASURING) {
		if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
			if (ruler.waypoints.length > 1)
				event.preventDefault()
			deleteWaypoint()
		}
		else {
			event.preventDefault()
			const snap = !event.shiftKey
			addWaypoint.call(ruler, ruler.destination, snap)
		}
	}
	return true
}

function onRulerMoveToken(event) {
	// This function is invoked by left clicking
	if (!this.isDragRuler)
		return false
	if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
		const snap = !event.shiftKey
		addWaypoint.call(this, this.destination, snap)
	}
	else
		deleteWaypoint()
	return true
}

function addWaypoint(point, snap=true) {
	if (snap)
		point = getSnapPointForToken(point.x, point.y, this.draggedToken)
	this.waypoints.push(new PIXI.Point(point.x, point.y));
	this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
}

function deleteWaypoint() {
	const ruler = canvas.controls.ruler
	if (ruler.waypoints.length > 1) {
		const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens)
		const rulerOffset = ruler.rulerOffset
		ruler._removeWaypoint({x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y})
		game.user.broadcastActivity({ruler: ruler})
	}
	else {
		const token = ruler.draggedToken
		ruler._endMeasurement()

		// Deactivate the drag workflow in mouse
		token.mouseInteractionManager._deactivateDragEvents();
		token.mouseInteractionManager.state = token.mouseInteractionManager.states.HOVER;

		// This will cancel the current drag operation
		// Pass in a fake event that hopefully is enough to allow other modules to function
		token._onDragLeftCancel({preventDefault: () => {return}})
	}
}

export function getColorForDistance(startDistance, subDistance=0) {
	if (!this.isDragRuler)
		return this.color
	// Don't apply colors if the current user doesn't have at least observer permissions
	if (this.draggedToken.actor.permission < 2) {
		// If this is a pc and alwaysShowSpeedForPCs is enabled we show the color anyway
		if (!(this.draggedToken.actor.data.type === "character" && game.settings.get(settingsKey, "alwaysShowSpeedForPCs")))
			return this.color
	}
	const distance = startDistance + subDistance
	const ranges = getRangesFromSpeedProvider(this.draggedToken)
	if (ranges.length === 0)
		return this.color
	const currentRange = ranges.reduce((minRange, currentRange) => {
		if (distance <= currentRange.range && currentRange.range < minRange.range)
			return currentRange
		return minRange
	}, {range: Infinity, color: getUnreachableColorFromSpeedProvider()})
	return currentRange.color
}
