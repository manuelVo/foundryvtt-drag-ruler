"use strict"

import {availableSpeedProviders, currentSpeedProvider, registerModule, registerSystem, setCurrentSpeedProvider} from "./api.js"
import {registerSettings, settingsKey} from "./settings.js"

Hooks.once("init", () => {
	registerSettings()
	hookTokenDragHandlers()
	hookRulerFunctions()
	patchRulerMeasure()
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
}

function onTokenLeftDragStart(event) {
	canvas.controls.ruler._onDragStart(event)
	canvas.controls.ruler.draggedToken = this
}

function onTokenLeftDragMove(event) {
	if (canvas.controls.ruler.isDragRuler)
		canvas.controls.ruler._onMouseMove(event)
}

function onTokenDragLeftDrop(event) {
	if (!canvas.controls.ruler.isDragRuler)
		return false
	canvas.controls.ruler.draggedToken = null
	canvas.controls.ruler.moveToken(event)
	return true
}

function onTokenDragLeftCancel(event) {
	if (!canvas.controls.ruler.isDragRuler)
		return false
	if (canvas.controls.ruler._state === Ruler.STATES.MEASURING) {
		if (canvas.controls.ruler.waypoints.length > 1) {
			canvas.controls.ruler._removeWaypoint(canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens), {snap: !event.shiftKey})
			game.user.broadcastActivity({ruler: canvas.controls.ruler})
			event.preventDefault()
		}
		else {
			canvas.controls.ruler._endMeasurement()
			canvas.controls.ruler.draggedToken = null
			return false
		}
	}
	return true
}

function onRulerMoveToken(event) {
	if (!this.isDragRuler)
		return false
	this._addWaypoint(this.destination)
	return true
}

function strInsertAfter(haystack, needle, strToInsert) {
	const pos = haystack.indexOf(needle) + needle.length
	return haystack.slice(0, pos) + strToInsert + haystack.slice(pos)
}

// These patches were written with foundry-0.7.9.js as reference
function patchRulerMeasure() {
	let code = Ruler.prototype.measure.toString()
	// Remove function signature and closing curly bracket (those are on the first and last line)
	code = code.slice(code.indexOf("\n"), code.lastIndexOf("\n"))
	code = strInsertAfter(code, "for ( let [i, d] of distances.entries() ) {\n", "segments[i].startDistance = totalDistance\n")
	code = strInsertAfter(code, "this._highlightMeasurement(ray", ", s.startDistance")

	// Don't show ruler if the measured token is invisible
	code = "if (this.isDragRuler && !this.draggedToken.isVisible) return [];" + code

	Ruler.prototype.measure = new Function("destination", "{gridSpaces=true}={}", code)
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
	const distance = startDistance + subDistance
	const ranges = currentSpeedProvider(this.draggedToken, this.color)
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
