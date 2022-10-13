import {getGridPositionFromPixels} from "./foundry_fixes.js";
import {disableSnap, moveWithoutAnimation} from "./keybindings.js";
import {trackRays} from "./movement_tracking.js";
import {recalculate} from "./socket.js";
import {getSnapPointForToken, highlightTokenShape, sum} from "./util.js";

// This is a modified version of Ruler.moveToken from foundry 0.7.9
export async function moveEntities(draggedEntity, selectedEntities) {
	let wasPaused = game.paused;
	if (wasPaused && !game.user.isGM) {
		ui.notifications.warn(game.i18n.localize("GAME.PausedWarning"));
		return false;
	}
	if (!this.visible || !this.destination) return false;
	if (!draggedEntity) return;

	// Wait until all scheduled measurements are done
	await this.deferredMeasurementPromise;

	// Get the movement rays and check collision along each Ray
	// These rays are center-to-center for the purposes of collision checking
	const rays = this.constructor.dragRulerGetRaysFromWaypoints(this.waypoints, this.destination);
	if (!game.user.isGM && draggedEntity instanceof Token) {
		const hasCollision = selectedEntities.some(token => {
			const offset = calculateEntityOffset(token, draggedEntity);
			const offsetRays = rays
				.filter(ray => !ray.isPrevious)
				.map(ray => applyOffsetToRay(ray, offset));
			return offsetRays.some(r =>
				token.checkCollision(r.B, {
					origin: r.A,
					mode: "any",
					type: "move",
				}),
			);
		});
		if (hasCollision) {
			ui.notifications.error(game.i18n.localize("ERROR.TokenCollide"));
			this._endMeasurement();
			return true;
		}
	}

	// Execute the movement path.
	// Transform each center-to-center ray into a top-left to top-left ray using the prior token offsets.
	this._state = Ruler.STATES.MOVING;
	await animateEntities.call(this, selectedEntities, draggedEntity, rays, wasPaused);

	// Once all animations are complete we can clear the ruler
	if (this.draggedEntity?.id === draggedEntity.id) this._endMeasurement();
}

// This is a modified version code extracted from Ruler.moveToken from foundry 0.7.9
async function animateEntities(entities, draggedEntity, draggedRays, wasPaused) {
	const newRays = draggedRays.filter(r => !r.isPrevious);
	const entityAnimationData = entities.map(entity => {
		const entityOffset = calculateEntityOffset(entity, draggedEntity);
		const offsetRays = newRays.map(ray => applyOffsetToRay(ray, entityOffset));

		// Determine offset relative to the Token top-left.
		// This is important so we can position the token relative to the ruler origin for non-1x1 tokens.
		const firstWaypoint = this.waypoints.find(w => !w.isPrevious);
		const origin = [firstWaypoint.x + entityOffset.x, firstWaypoint.y + entityOffset.y];
		let dx, dy;
		if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
			dx = entity.x - origin[0];
			dy = entity.y - origin[1];
		} else {
			dx = entity.x - origin[0];
			dy = entity.y - origin[1];
		}

		return {entity, rays: offsetRays, dx, dy};
	});

	const isToken = draggedEntity instanceof Token;
	const animate = isToken && !moveWithoutAnimation;
	const startWaypoint = animate ? 0 : entityAnimationData[0].rays.length - 1;

	// This is a flag of the "Monk's Active Tile Triggers" module that signals that the movement should be cancelled early
	this.cancelMovement = false;

	for (let i = startWaypoint; i < entityAnimationData[0].rays.length; i++) {
		if (!wasPaused && game.paused) break;
		const entityPaths = entityAnimationData.map(({entity, rays, dx, dy}) => {
			const ray = rays[i];
			const dest = [ray.B.x, ray.B.y];
			const path = new Ray({x: entity.x, y: entity.y}, {x: dest[0] + dx, y: dest[1] + dy});
			return {entity, path};
		});
		const updates = entityPaths.map(({entity, path}) => {
			return {x: path.B.x, y: path.B.y, _id: entity.id};
		});
		await draggedEntity.scene.updateEmbeddedDocuments(
			draggedEntity.constructor.embeddedName,
			updates,
			{animate},
		);
		if (animate)
			await Promise.all(
				entityPaths.map(({entity}) => CanvasAnimation.getAnimation(entity.animationName)?.promise),
			);

		// This is a flag of the "Monk's Active Tile Triggers" module that signals that the movement should be cancelled early
		if (this.cancelMovement) {
			entityAnimationData.forEach(ead => (ead.rays = ead.rays.slice(0, i + 1)));
			break;
		}
	}
	if (isToken)
		trackRays(
			entities,
			entityAnimationData.map(({rays}) => rays),
		).then(() => recalculate(entities));
}

function calculateEntityOffset(entityA, entityB) {
	return {x: entityA.x - entityB.x, y: entityA.y - entityB.y};
}

function applyOffsetToRay(ray, offset) {
	const newRay = new Ray(
		{x: ray.A.x + offset.x, y: ray.A.y + offset.y},
		{x: ray.B.x + offset.x, y: ray.B.y + offset.y},
	);
	newRay.isPrevious = ray.isPrevious;
	return newRay;
}

// This is a modified version of Ruler._onMouseMove from foundry 0.7.9
export function onMouseMove(event) {
	if (this._state === Ruler.STATES.MOVING) return;

	// Extract event data
	const destination = {
		x: event.data.destination.x + this.rulerOffset.x,
		y: event.data.destination.y + this.rulerOffset.y,
	};

	// Hide any existing Token HUD
	canvas.hud.token.clear();
	delete event.data.hudState;

	// Draw measurement updates
	scheduleMeasurement.call(this, destination, event);
}

function scheduleMeasurement(destination, event) {
	const measurementInterval = 50;
	const mt = event._measureTime || 0;
	const originalEvent = event.data.originalEvent;
	if (Date.now() - mt > measurementInterval) {
		this.measure(destination, {snap: !disableSnap});
		event._measureTime = Date.now();
		this._state = Ruler.STATES.MEASURING;
		cancelScheduledMeasurement.call(this);
	} else {
		this.deferredMeasurementData = {destination, event};
		if (!this.deferredMeasurementTimeout) {
			this.deferredMeasurementPromise = new Promise(
				(resolve, reject) => (this.deferredMeasurementResolve = resolve),
			);
			this.deferredMeasurementTimeout = window.setTimeout(
				() =>
					scheduleMeasurement.call(
						this,
						this.deferredMeasurementData.destination,
						this.deferredMeasurementData.event,
					),
				measurementInterval,
			);
		}
	}
}

export function cancelScheduledMeasurement() {
	window.clearTimeout(this.deferredMeasurementTimeout);
	this.deferredMeasurementTimeout = undefined;
	this.deferredMeasurementResolve?.();
}

export function highlightMeasurementNative(
	ray,
	previousSegments,
	tokenShape = [{x: 0, y: 0}],
	alpha = 1,
) {
	const spacer = canvas.scene.gridType === CONST.GRID_TYPES.SQUARE ? 1.41 : 1;
	const nMax = Math.max(
		Math.floor(ray.distance / (spacer * Math.min(canvas.grid.w, canvas.grid.h))),
		1,
	);
	const tMax = Array.fromRange(nMax + 1).map(t => t / nMax);

	// Track prior position
	let prior = null;

	// Iterate over ray portions
	for (let [i, t] of tMax.reverse().entries()) {
		let {x, y} = ray.project(t);

		// Get grid position
		let [x0, y0] = i === 0 ? [null, null] : prior;
		let [x1, y1] = canvas.grid.grid.getGridPositionFromPixels(x, y);
		if (x0 === x1 && y0 === y1) continue;

		// Highlight the grid position
		let [xgtl, ygtl] = canvas.grid.grid.getPixelsFromGridPosition(x1, y1);
		let [xg, yg] = canvas.grid.grid.getCenter(xgtl, ygtl);
		const pathUntilSpace = previousSegments.concat([{ray: new Ray(ray.A, {x: xg, y: yg})}]);
		const distance = sum(canvas.grid.measureDistances(pathUntilSpace, {gridSpaces: true}));
		const color = this.dragRulerGetColorForDistance(distance);
		const snapPoint = getSnapPointForToken(...canvas.grid.getTopLeft(x, y), this.draggedEntity);
		const [snapX, snapY] = getGridPositionFromPixels(snapPoint.x + 1, snapPoint.y + 1);

		prior = [x1, y1];

		// If the positions are not neighbors, also highlight their halfway point
		if (i > 0 && !canvas.grid.isNeighbor(x0, y0, x1, y1)) {
			let th = tMax[i - 1] - 0.5 / nMax;
			let {x, y} = ray.project(th);
			let [x1h, y1h] = canvas.grid.grid.getGridPositionFromPixels(x, y);
			let [xghtl, yghtl] = canvas.grid.grid.getPixelsFromGridPosition(x1h, y1h);
			let [xgh, ygh] = canvas.grid.grid.getCenter(xghtl, yghtl);
			const pathUntilSpace = previousSegments.concat([{ray: new Ray(ray.A, {x: xgh, y: ygh})}]);
			const distance = sum(canvas.grid.measureDistances(pathUntilSpace, {gridSpaces: true}));
			const color = this.dragRulerGetColorForDistance(distance);
			const snapPoint = getSnapPointForToken(...canvas.grid.getTopLeft(x, y), this.draggedEntity);
			const [snapX, snapY] = getGridPositionFromPixels(snapPoint.x + 1, snapPoint.y + 1);
			highlightTokenShape.call(this, {x: snapX, y: snapY}, tokenShape, color, alpha);
		}

		highlightTokenShape.call(this, {x: snapX, y: snapY}, tokenShape, color, alpha);
	}
}
