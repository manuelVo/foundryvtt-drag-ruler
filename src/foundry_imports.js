import {getColorForDistance} from "./main.js"

// This is a modified version of Ruler.moveToken from foundry 0.7.9
export async function moveTokens(draggedToken, selectedTokens) {
	let wasPaused = game.paused;
	if (wasPaused && !game.user.isGM) {
		ui.notifications.warn(game.i18n.localize("GAME.PausedWarning"));
		return false;
	}
	if (!this.visible || !this.destination) return false;
	if (!draggedToken) return;

	// Get the movement rays and check collision along each Ray
	// These rays are center-to-center for the purposes of collision checking
	const rays = this._getRaysFromWaypoints(this.waypoints, this.destination);
	if (!game.user.isGM) {
		const hasCollision = selectedTokens.some(token => {
			const offset = calculateTokenOffset(token, draggedToken)
			const offsetRays = rays.map(ray => applyOffsetToRay(ray, offset))
			return offsetRays.some(r => canvas.walls.checkCollision(r));
		})
		if (hasCollision) {
			ui.notifications.error(game.i18n.localize("ERROR.TokenCollide"));
			this._endMeasurement();
			return true;
		}
	}

	// Execute the movement path.
	// Transform each center-to-center ray into a top-left to top-left ray using the prior token offsets.
	this._state = Ruler.STATES.MOVING;
	await Promise.all(selectedTokens.map(token => {
		// Return the promise so we can wait for it outside the loop
		const offset = calculateTokenOffset(token, draggedToken)
		return animateToken.call(this, token, rays, offset, wasPaused)
	}))

	// Once all animations are complete we can clear the ruler
	this._endMeasurement();
}

// This is a modified version code extracted from Ruler.moveToken from foundry 0.7.9
async function animateToken(token, rays, tokenOffset, wasPaused) {
	const offsetRays = rays.map(ray => applyOffsetToRay(ray, tokenOffset))

	// Determine offset relative to the Token top-left.
	// This is important so we can position the token relative to the ruler origin for non-1x1 tokens.
	const origin = [this.waypoints[0].x + tokenOffset.x, this.waypoints[0].y + tokenOffset.y]
	let dx, dy
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		dx = token.data.x - origin[0]
		dy = token.data.y - origin[1]
	}
	else {
		dx = token.data.x - origin[0]
		dy = token.data.y - origin[1]
	}

	token._noAnimate = true;
	for (let r of offsetRays) {
		if (!wasPaused && game.paused) break;
		const dest = [r.B.x, r.B.y];
		const path = new Ray({ x: token.x, y: token.y }, { x: dest[0] + dx, y: dest[1] + dy });
		await token.update(path.B);
		await token.animateMovement(path);
	}
	token._noAnimate = false;
}

function calculateTokenOffset(tokenA, tokenB) {
	return {x: tokenA.data.x - tokenB.data.x, y: tokenA.data.y - tokenB.data.y}
}

function applyOffsetToRay(ray, offset) {
	return new Ray({x: ray.A.x + offset.x, y: ray.A.y + offset.y}, {x: ray.B.x + offset.x, y: ray.B.y + offset.y})
}

// This is a modified version of Ruler._onMouseMove from foundry 0.7.9
export function onMouseMove(event) {
	if (this._state === Ruler.STATES.MOVING) return;

	// Extract event data
	const mt = event._measureTime || 0;
	const originalEvent = event.data.originalEvent;
	const destination = {x: event.data.destination.x + this.rulerOffset.x, y: event.data.destination.y + this.rulerOffset.y}

	// Hide any existing Token HUD
	canvas.hud.token.clear();
	delete event.data.hudState;

	// Draw measurement updates
	if (Date.now() - mt > 50) {
		this.measure(destination, {snap: !originalEvent.shiftKey});
		event._measureTime = Date.now();
		this._state = Ruler.STATES.MEASURING;
	}
}

// This is a modified version of Ruler.measure form foundry 0.7.9
export function measure(destination, {gridSpaces=true, snap=false} = {}) {
	if (this.isDragRuler && !this.draggedToken.isVisible)
		return []

	if (snap)
		destination = new PIXI.Point(...canvas.grid.getCenter(destination.x, destination.y));
	const waypoints = this.waypoints.concat([destination]);
	const centeredWaypoints = waypoints.map(w => new PIXI.Point(...canvas.grid.getCenter(w.x, w.y)))
	const r = this.ruler;
	this.destination = destination;

	// Iterate over waypoints and construct segment rays
	const segments = [];
	const centeredSegments = []
	for (let [i, dest] of waypoints.slice(1).entries()) {
		const centeredDest = centeredWaypoints[i + 1]
		const origin = waypoints[i];
		const centeredOrigin = centeredWaypoints[i]
		const label = this.labels.children[i];
		const ray = new Ray(origin, dest);
		const centeredRay = new Ray(centeredOrigin, centeredDest)
		if (ray.distance < 10) {
			if (label) label.visible = false;
			continue;
		}
		segments.push({ ray, label });
		centeredSegments.push({ray: centeredRay, label})
	}

	// Compute measured distance
	const distances = canvas.grid.measureDistances(centeredSegments, { gridSpaces });
	let totalDistance = 0;
	for (let [i, d] of distances.entries()) {
		let s = segments[i];
		s.startDistance = totalDistance
		totalDistance += d;
		s.last = i === (segments.length - 1);
		s.distance = d;
		s.text = this._getSegmentLabel(d, totalDistance, s.last);
	}

	// Clear the grid highlight layer
	const hlt = canvas.grid.highlightLayers[this.name] || canvas.grid.addHighlightLayer(this.name);
	hlt.clear();

	// Draw measured path
	r.clear();
	let rulerColor
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS)
		rulerColor = getColorForDistance.call(this, totalDistance)
	else
		rulerColor = this.color
	for (let s of segments) {
		const { ray, label, text, last } = s;

		// Draw line segment
		r.lineStyle(6, 0x000000, 0.5).moveTo(ray.A.x, ray.A.y).lineTo(ray.B.x, ray.B.y)
			.lineStyle(4, rulerColor, 0.25).moveTo(ray.A.x, ray.A.y).lineTo(ray.B.x, ray.B.y);

		// Draw the distance label just after the endpoint of the segment
		if (label) {
			label.text = text;
			label.alpha = last ? 1.0 : 0.5;
			label.visible = true;
			let labelPosition = ray.project((ray.distance + 50) / ray.distance);
			label.position.set(labelPosition.x, labelPosition.y);
		}

		// Highlight grid positions
		highlightMeasurementNative.call(this, ray, s.startDistance);
	}

	// Draw endpoints
	for (let p of waypoints) {
		r.lineStyle(2, 0x000000, 0.5).beginFill(rulerColor, 0.25).drawCircle(p.x, p.y, 8);
	}

	// Return the measured segments
	return segments;
}

export function highlightMeasurementNative(ray, startDistance) {
	const spacer = canvas.scene.data.gridType === CONST.GRID_TYPES.SQUARE ? 1.41 : 1;
	const nMax = Math.max(Math.floor(ray.distance / (spacer * Math.min(canvas.grid.w, canvas.grid.h))), 1);
	const tMax = Array.fromRange(nMax+1).map(t => t / nMax);

	// Track prior position
	let prior = null;

	// Iterate over ray portions
	for ( let [i, t] of tMax.entries() ) {
		let {x, y} = ray.project(t);

		// Get grid position
		let [x0, y0] = (i === 0) ? [null, null] : prior;
		let [x1, y1] = canvas.grid.grid.getGridPositionFromPixels(x, y);
		if ( x0 === x1 && y0 === y1 ) continue;

		// Highlight the grid position
		let [xg, yg] = canvas.grid.grid.getPixelsFromGridPosition(x1, y1);
		let subDistance = canvas.grid.measureDistances([{ray: new Ray(ray.A, {x: xg, y: yg})}], {gridSpaces: true})[0]
		let color = dragRuler.getColorForDistance.call(this, startDistance, subDistance)
		canvas.grid.highlightPosition(this.name, {x: xg, y: yg, color: color});

		// Skip the first one
		prior = [x1, y1];
		if ( i === 0 ) continue;

		// If the positions are not neighbors, also highlight their halfway point
		if ( !canvas.grid.isNeighbor(x0, y0, x1, y1) ) {
			let th = tMax[i - 1] + (0.5 / nMax);
			let {x, y} = ray.project(th);
			let [x1h, y1h] = canvas.grid.grid.getGridPositionFromPixels(x, y);
			let [xgh, ygh] = canvas.grid.grid.getPixelsFromGridPosition(x1h, y1h);
			subDistance = canvas.grid.measureDistances([{ray: new Ray(ray.A, {x: xgh, y: ygh})}], {gridSpaces: true})[0]
			color = dragRuler.getColorForDistance.call(this, startDistance, subDistance)
			canvas.grid.highlightPosition(this.name, {x: xgh, y: ygh, color: color});
		}
	}
}
