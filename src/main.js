"use strict"

import {availableSpeedProviders, currentSpeedProvider, registerModule, registerSystem, setCurrentSpeedProvider} from "./api.js"
import {measure, moveTokens, onMouseMove} from "./foundry_imports.js"
import {registerSettings, settingsKey} from "./settings.js"

Hooks.once("init", () => {
	registerSettings()
	hookTokenDragHandlers()
	hookRulerFunctions()
	patchRulerHighlightMeasurement()

	availableSpeedProviders["native"] = nativeSpeedProvider
	setCurrentSpeedProvider(nativeSpeedProvider)

	window.dragRuler = {
		getColorForDistance,
		registerModule,
		registerSystem
	}

})

Hooks.once("ready", () => {
	Hooks.callAll("dragRuler.ready")
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
}

function onTokenLeftDragStart(event) {
	canvas.controls.ruler.draggedToken = this
	const tokenCenter = {x: this.x + canvas.grid.grid.w / 2, y: this.y + canvas.grid.grid.h / 2}
	canvas.controls.ruler.clear();
	canvas.controls.ruler._state = Ruler.STATES.STARTING;
	canvas.controls.ruler.rulerOffset = {x: tokenCenter.x - event.data.origin.x, y: tokenCenter.y - event.data.origin.y}
	addWaypoint.call(canvas.controls.ruler, tokenCenter, false);
}

function onTokenLeftDragMove(event) {
	if (canvas.controls.ruler.isDragRuler)
		onMouseMove.call(canvas.controls.ruler, event)
}

function onTokenDragLeftDrop(event) {
	if (!canvas.controls.ruler.isDragRuler)
		return false
	const selectedTokens = canvas.tokens.placeables.filter(token => token._controlled)
	moveTokens.call(canvas.controls.ruler, canvas.controls.ruler.draggedToken, selectedTokens)
	canvas.controls.ruler.draggedToken = null
	return true
}

function onTokenDragLeftCancel(event) {
	// This function is invoked by right clicking
	if (!canvas.controls.ruler.isDragRuler)
		return false
	if (canvas.controls.ruler._state === Ruler.STATES.MEASURING) {
		if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
			if (canvas.controls.ruler.waypoints.length > 1)
				event.preventDefault()
			deleteWaypoint()
		}
		else {
			event.preventDefault()
			const snap = !event.shiftKey
			addWaypoint.call(canvas.controls.ruler, canvas.controls.ruler.destination, snap)
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
		point = canvas.grid.getCenter(point.x, point.y);
	else
		point = [point.x, point.y]
	this.waypoints.push(new PIXI.Point(point[0], point[1]));
	this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
}

function deleteWaypoint() {
	if (canvas.controls.ruler.waypoints.length > 1) {
		const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens)
		const rulerOffset = canvas.controls.ruler.rulerOffset
		canvas.controls.ruler._removeWaypoint({x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y})
		game.user.broadcastActivity({ruler: canvas.controls.ruler})
	}
	else {
		const token = canvas.controls.ruler.draggedToken
		canvas.controls.ruler._endMeasurement()
		canvas.controls.ruler.draggedToken = null

		// Deactivate the drag workflow in mouse
		token.mouseInteractionManager._deactivateDragEvents();
		token.mouseInteractionManager.state = token.mouseInteractionManager.states.HOVER;

		// This will cancel the current drag operation
		// Pass in a fake event that hopefully is enough to allow other modules to function
		token._onDragLeftCancel({preventDefault: () => {return}})
	}
}

function strInsertAfter(haystack, needle, strToInsert) {
	const pos = haystack.indexOf(needle) + needle.length
	return haystack.slice(0, pos) + strToInsert + haystack.slice(pos)
}

function nativeSpeedProvider(token, playercolor) {
	const speedAttribute = game.settings.get(settingsKey, "speedAttribute")
	if (!speedAttribute)
		return []
	const tokenSpeed = getProperty(token, speedAttribute)
	if (tokenSpeed === undefined) {
		console.warn(`Drag Ruler | The configured token speed attribute "${speedAttribute}" didn't return a speed value. To use colors based on drag distance set the setting to the correct value (or clear the box to disable this feature).`)
		return []
	}
	const dashMultiplier = game.settings.get(settingsKey, "dashMultiplier")
	if (!dashMultiplier)
		return [{range: tokenSpeed, color: playercolor}]
	return [{range: tokenSpeed, color: playercolor}, {range: tokenSpeed * dashMultiplier, color: 0xFFFF00}]
}

function getColorForDistance(startDistance, subDistance) {
	if (!this.isDragRuler)
		return this.color
	// Don't apply colors if the current user doesn't have at least observer permissions
	if (this.draggedToken.actor.permission < 2) {
		// If this is a pc and alwaysShowSpeedForPCs is enabled we show the color anyway
		if (!(this.draggedToken.actor.data.type === "character" && game.settings.get(settingsKey, "alwaysShowSpeedForPCs")))
			return this.color
	}
	const distance = startDistance + subDistance
	const firstColor = game.settings.get(settingsKey, "staticFirstColor") ? 0x00FF00 : this.color
	const ranges = currentSpeedProvider(this.draggedToken, firstColor)
	if (ranges.length === 0)
		return this.color
	const currentRange = ranges.reduce((minRange, currentRange) => {
		if (distance <= currentRange.range && currentRange.range < minRange.range)
			return currentRange
		return minRange
	}, {range: Infinity, color: 0xFF0000})
	return currentRange.color
}

// These patches were written with foundry-0.7.9.js as reference
function patchRulerHighlightMeasurement() {
	let code = Ruler.prototype._highlightMeasurement.toString()
	// Replace CRLF with LF in case foundry.js has CRLF for some reason
	code = code.replace(/\r\n/g, "\n")
	// Remove function signature and closing curly bracket (those are on the first and last line)
	code = code.slice(code.indexOf("\n"), code.lastIndexOf("\n"))

	const calcColorCode = `
		let subDistance = canvas.grid.measureDistances([{ray: new Ray(ray.A, {x: xg, y: yg})}], {gridSpaces: true})[0]
		let color = dragRuler.getColorForDistance.call(this, startDistance, subDistance)
	`

	code = strInsertAfter(code, "Position(x1, y1);\n", calcColorCode)
	code = strInsertAfter(code, "Position(x1h, y1h);\n", calcColorCode.replace("x: xg, y: yg", "x: xgh, y: ygh"))
	code = code.replace(/color: this\.color\}/g, "color}")
	Ruler.prototype._highlightMeasurement = new Function("ray", "startDistance=undefined", code)
}
