import {highlightMeasurementTerrainRuler, measureDistances} from "./compatibility.js";
import {getGridPositionFromPixels} from "./foundry_fixes.js";
import {getColorForDistance} from "./main.js"
import {trackRays} from "./movement_tracking.js"
import {applyTokenSizeOffset, getSnapPointForToken, getTokenShape, highlightTokenShape, zip} from "./util.js";

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
	const rays = this.constructor.dragRulerGetRaysFromWaypoints(this.waypoints, this.destination);
	if (!game.user.isGM) {
		const hasCollision = selectedTokens.some(token => {
			const offset = calculateTokenOffset(token, draggedToken)
			const offsetRays = rays.filter(ray => !ray.isPrevious).map(ray => applyOffsetToRay(ray, offset))
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
	await animateTokens.call(this, selectedTokens, draggedToken, rays, wasPaused);

	// Once all animations are complete we can clear the ruler
	if (this.draggedToken.id === draggedToken.id)
		this._endMeasurement();
}

// This is a modified version code extracted from Ruler.moveToken from foundry 0.7.9
async function animateTokens(tokens, draggedToken, draggedRays, wasPaused) {
	const newRays = draggedRays.filter(r => !r.isPrevious);
	const tokenAnimationData = tokens.map(token => {
		const tokenOffset = calculateTokenOffset(token, draggedToken);
		const offsetRays = newRays.map(ray => applyOffsetToRay(ray, tokenOffset));

		// Determine offset relative to the Token top-left.
		// This is important so we can position the token relative to the ruler origin for non-1x1 tokens.
		const firstWaypoint = this.waypoints.find(w => !w.isPrevious);
		const origin = [firstWaypoint.x + tokenOffset.x, firstWaypoint.y + tokenOffset.y];
		let dx, dy;
		if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
			dx = token.data.x - origin[0];
			dy = token.data.y - origin[1];
		}
		else {
			dx = token.data.x - origin[0];
			dy = token.data.y - origin[1];
		}

		return {token, rays: offsetRays, dx, dy};
	});

	for (const {token, rays} of tokenAnimationData) {
		trackRays(token, rays);
		token._noAnimate = true;
	}
	for (let i = 0;i < tokenAnimationData[0].rays.length; i++) {
		if (!wasPaused && game.paused) break;
		const tokenPaths = tokenAnimationData.map(({token, rays, dx, dy}) => {
			const ray = rays[i];
			const dest = [ray.B.x, ray.B.y];
			const path = new Ray({x: token.x, y: token.y}, {x: dest[0] + dx, y: dest[1] + dy});
			return {token, path};
		});
		const updates = tokenPaths.map(({token, path}) => {
			return {x: path.B.x, y: path.B.y, _id: token.id};
		});
		await draggedToken.scene.updateEmbeddedEntity(draggedToken.constructor.embeddedName, updates);
		await Promise.all(tokenPaths.map(({token, path}) => token.animateMovement(path)));
	}
	for (const {token} of tokenAnimationData) {
		token._noAnimate = false;
	}
}

function calculateTokenOffset(tokenA, tokenB) {
	return {x: tokenA.data.x - tokenB.data.x, y: tokenA.data.y - tokenB.data.y}
}

function applyOffsetToRay(ray, offset) {
	const newRay = new Ray({x: ray.A.x + offset.x, y: ray.A.y + offset.y}, {x: ray.B.x + offset.x, y: ray.B.y + offset.y});
	newRay.isPrevious = ray.isPrevious;
	return newRay;
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
		destination = getSnapPointForToken(destination.x, destination.y, this.draggedToken)

	const terrainRulerAvailable = game.modules.get("terrain-ruler")?.active && canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS;

	const waypoints = this.waypoints.concat([destination]);
	// Move the waypoints to the center of the grid if a size is used that measures from edge to edge
	const centeredWaypoints = applyTokenSizeOffset(waypoints, this.draggedToken)
	// Foundries native ruler requires the waypoints to sit in the dead center of the square to work properly
	if (!terrainRulerAvailable)
		centeredWaypoints.forEach(w => [w.x, w.y] = canvas.grid.getCenter(w.x, w.y));

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
		ray.isPrevious = Boolean(origin.isPrevious);
		centeredRay.isPrevious = ray.isPrevious;
		ray.dragRulerVisitedSpaces = origin.dragRulerVisitedSpaces;
		centeredRay.dragRulerVisitedSpaces = ray.dragRulerVisitedSpaces;
		if (ray.distance < 10) {
			if (label) label.visible = false;
			continue;
		}
		segments.push({ ray, label });
		centeredSegments.push({ray: centeredRay, label})
	}


	const shape = getTokenShape(this.draggedToken)

	// Compute measured distance
	const distances = measureDistances(centeredSegments, this.draggedToken, shape, gridSpaces);

	let totalDistance = 0;
	for (let [i, d] of distances.entries()) {
		let s = centeredSegments[i];
		s.startDistance = totalDistance
		totalDistance += d;
		s.last = i === (centeredSegments.length - 1);
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
	for (const [s, cs] of zip(segments.reverse(), centeredSegments.reverse())) {
		const { label, text, last } = cs;

		// Draw line segment
		const opacityMultiplier = s.ray.isPrevious ? 0.33 : 1;
		r.lineStyle(6, 0x000000, 0.5 * opacityMultiplier).moveTo(s.ray.A.x, s.ray.A.y).lineTo(s.ray.B.x, s.ray.B.y)
			.lineStyle(4, rulerColor, 0.25 * opacityMultiplier).moveTo(s.ray.A.x, s.ray.A.y).lineTo(s.ray.B.x, s.ray.B.y);

		// Draw the distance label just after the endpoint of the segment
		if (label) {
			label.text = text;
			label.alpha = last ? 1.0 : 0.5;
			label.visible = true;
			let labelPosition = cs.ray.project((cs.ray.distance + 50) / cs.ray.distance);
			label.position.set(labelPosition.x, labelPosition.y);
		}

		// Highlight grid positions
		if (terrainRulerAvailable)
			highlightMeasurementTerrainRuler.call(this, cs.ray, cs.startDistance, shape, opacityMultiplier)
		else
			highlightMeasurementNative.call(this, cs.ray, cs.startDistance, shape, opacityMultiplier);
	}

	// Draw endpoints
	for (let p of waypoints) {
		r.lineStyle(2, 0x000000, 0.5).beginFill(rulerColor, 0.25).drawCircle(p.x, p.y, 8);
	}

	// Return the measured segments
	return segments;
}

export function highlightMeasurementNative(ray, startDistance, tokenShape=[{x: 0, y: 0}], alpha=1) {
	const spacer = canvas.scene.data.gridType === CONST.GRID_TYPES.SQUARE ? 1.41 : 1;
	const nMax = Math.max(Math.floor(ray.distance / (spacer * Math.min(canvas.grid.w, canvas.grid.h))), 1);
	const tMax = Array.fromRange(nMax+1).map(t => t / nMax);

	// Track prior position
	let prior = null;

	// Iterate over ray portions
	for ( let [i, t] of tMax.reverse().entries() ) {
		let {x, y} = ray.project(t);

		// Get grid position
		let [x0, y0] = (i === 0) ? [null, null] : prior;
		let [x1, y1] = canvas.grid.grid.getGridPositionFromPixels(x, y);
		if ( x0 === x1 && y0 === y1 ) continue;

		// Highlight the grid position
		let [xg, yg] = canvas.grid.grid.getPixelsFromGridPosition(x1, y1);
		const subDistance = canvas.grid.measureDistances([{ray: new Ray(ray.A, {x: xg, y: yg})}], {gridSpaces: true})[0]
		const color = dragRuler.getColorForDistance.call(this, startDistance, subDistance)
		const snapPoint = getSnapPointForToken(...canvas.grid.getTopLeft(x, y), this.draggedToken);
		const [snapX, snapY] = getGridPositionFromPixels(snapPoint.x + 1, snapPoint.y + 1);

		prior = [x1, y1];

		// If the positions are not neighbors, also highlight their halfway point
		if (i > 0 && !canvas.grid.isNeighbor(x0, y0, x1, y1)) {
			let th = tMax[i - 1] - (0.5 / nMax);
			let {x, y} = ray.project(th);
			let [x1h, y1h] = canvas.grid.grid.getGridPositionFromPixels(x, y);
			let [xgh, ygh] = canvas.grid.grid.getPixelsFromGridPosition(x1h, y1h);
			const subDistance = canvas.grid.measureDistances([{ray: new Ray(ray.A, {x: xgh, y: ygh})}], {gridSpaces: true})[0]
			const color = dragRuler.getColorForDistance.call(this, startDistance, subDistance)
			const snapPoint = getSnapPointForToken(...canvas.grid.getTopLeft(x, y), this.draggedToken);
			const [snapX, snapY] = getGridPositionFromPixels(snapPoint.x + 1, snapPoint.y + 1);
			highlightTokenShape.call(this, {x: snapX, y: snapY}, tokenShape, color, alpha);
		}

		highlightTokenShape.call(this, {x: snapX, y: snapY}, tokenShape, color, alpha);
	}
}
