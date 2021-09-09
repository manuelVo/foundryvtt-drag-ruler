import {settingsKey} from "./settings.js"
import { applyTokenSizeOffset, getTokenShape, getSnapPointForToken, setSnapParameterOnOptions } from "./util.js";
import { dragRulerAddWaypointHistory,
				 dragRulerClearWaypoints,
				 dragRulerDeleteWaypoint,
				 dragRulerAbortDrag,
				 dragRulerRecalculate } from "./ruler.js";

import { cancelScheduledMeasurement, calculateEntityOffset, applyOffsetToRay } from "./foundry_imports.js";

export function registerLibRuler() {
	// Wrappers for base Ruler methods
	libWrapper.register(settingsKey, "Ruler.prototype.clear", dragRulerClear, "WRAPPER");
	libWrapper.register(settingsKey, "Ruler.prototype.update", dragRulerUpdate, "MIXED");
	libWrapper.register(settingsKey, "Ruler.prototype._endMeasurement", dragRulerEndMeasurement, "WRAPPER");
	libWrapper.register(settingsKey, "Ruler.prototype._onMouseMove", dragRulerOnMouseMove, "WRAPPER");
	libWrapper.register(settingsKey, "Ruler.prototype._getMovementToken", dragRulerGetMovementToken, "MIXED");
	libWrapper.register(settingsKey, "Ruler.prototype.moveToken", dragRulerMoveToken, "MIXED");

	// Wrappers for libRuler Ruler methods
	libWrapper.register(settingsKey, "Ruler.prototype.setDestination", dragRulerSetDestination, "WRAPPER");
	libWrapper.register(settingsKey, "Ruler.prototype._addWaypoint", dragRulerAddWaypoint, "WRAPPER");
	libWrapper.register(settingsKey, "Ruler.prototype.deferMeasurement", dragRulerDeferMeasurement, "WRAPPER");
	libWrapper.register(settingsKey, "Ruler.prototype.cancelScheduledMeasurement", dragRulerCancelScheduledMeasurement, "WRAPPER");
	libWrapper.register(settingsKey, "Ruler.prototype.doDeferredMeasurements", dragRulerDoDeferredMeasurements, "WRAPPER");
  libWrapper.register(settingsKey, "Ruler.prototype.testForCollision", dragRulerTestForCollision, "MIXED");
  libWrapper.register(settingsKey, "Ruler.prototype.animateToken", dragRulerAnimateToken, "WRAPPER");

	// Wrappers for libRuler RulerSegment methods
	libWrapper.register(settingsKey, "window.libRuler.RulerSegment.prototype.addProperties", dragRulerAddProperties, "WRAPPER");

	addRulerProperties();

	// tell libWrapper that it can ignore the conflict warning from drag ruler not always calling
	// the underlying method for Ruler.moveToken. (i.e., drag ruler interrupts it
	// if just adding or deleting a waypoint)
	libWrapper.ignore_conflicts(settingsKey, "libruler", "Ruler.prototype.moveToken");
}


// Functions mostly adapted from ruler.js, originally in class DragRulerRuler

/*
 * Clear display of the current Ruler.
 * Wrap for Ruler.clear
 */
function dragRulerClear(wrapped) {
	this.cancelScheduledMeasurement();
	wrapped();
}


/*
 * Modify update to avoid showing a GM drag ruler to non-GM players.
 * Wrap for Ruler.update
 */
function dragRulerUpdate(wrapped, data) {
	if(this.draggedEntity && this.user.isGM && !game.user.isGM && !game.settings.get(settingsKey, "showGMRulerToPlayers"))
			return;

	wrapped(data);
}

/*
 * clean up after measuring
 */
function dragRulerEndMeasurement(wrapped) {
	this.unsetFlag(settingsKey, "draggedEntityID");
	this.unsetFlag(settingsKey, "rulerOffset");
	wrapped();
}



// Wrappers for libRuler Ruler methods

/*
 * Wrap for Ruler._onMouseMove
 * Must set the offset for the destination before onMouseMove measures the distance
 * Offset then used for the measurement, if it occurs
 */

function dragRulerOnMouseMove(wrapped, event) {
	if(!this.isDragRuler) return wrapped(event);

	const offset = this.getFlag(settingsKey, "rulerOffset");
	event.data.destination.x = event.data.destination.x + offset.x;
	event.data.destination.y = event.data.destination.y + offset.y;

	wrapped(event);
	// FYI: original drag ruler version calls this.measure with {snap: !originalEvent.shiftKey}, not {gridSpace: !originalEvent.shiftKey}
}

// The below deferMeasurement and cancelScheduleMeasurement handle situation in which
// if a measurement is being skipped because of the ruler's rate limiting,
// schedule the measurement for later to ensure the ruler sticks to the token
// see https://github.com/manuelVo/foundryvtt-drag-ruler/commit/3cbe41e2be7b4ca8dabcf98094caad15a321ddc0#diff-8afd60da4c5dc44f5ed9d0c15918eab6724af29b5d385b05a1cd0aaa85bfcf8c

/*
 * Wrap for libRuler Ruler.deferMeasurement
 *
 */
function dragRulerDeferMeasurement(wrapped, destination, event) {
	if(this.isDragRuler) {
		this.deferredMeasurementData = {destination, event};
		if (!this.deferredMeasurementTimeout) {
			this.deferredMeasurementPromise = new Promise((resolve, reject) => this.deferredMeasurementResolve = resolve);
			this.deferredMeasurementTimeout = window.setTimeout(() => this.scheduleMeasurement(this.deferredMeasurementData.destination, this.deferredMeasurementData.event));
		}
	}
	return wrapped(destination, event);
}

/*
 * Wrap for libRuler Ruler.cancelScheduledMeasurement
 * Uses existing internal drag ruler function to avoid unnecessary copy
 */
function dragRulerCancelScheduledMeasurement(wrapped) {
	if(this.isDragRuler) { cancelScheduledMeasurement.call(this); }
	return wrapped();
}

/*
 * Wrap for libRuler Ruler.doDeferredMeasurement
 * This is called from Ruler.moveToken and will catch the deferred promise in dragRulerDeferMeasurement above
 */
async function dragRulerDoDeferredMeasurements() {
	if(this.isDragRuler) { await this.deferredMeasurementPromise; }
	return wrapped();
}

/*
 * Wrapper for libRuler Ruler.testForCollision
 * Don't check for collisions if GM, so that GM can drag tokens through walls.
 */
function dragRulerTestForCollision(wrapped, rays) {
 // taken from foundry_imports.js moveEntities function
 if(this.isDragRuler) {
   if(game.user.isGM) return false;
   const draggedEntity = this._getMovementToken();

   if(draggedEntity instanceof Token) {
     const selectedEntities = canvas.tokens.controlled;
     const hasCollision = selectedEntities.some(token => {
			 const offset = calculateEntityOffset(token, draggedEntity);
			 const offsetRays = rays.filter(ray => !ray.isPrevious).map(ray => applyOffsetToRay(ray, offset))
			 return offsetRays.some(r => canvas.walls.checkCollision(r));
		 });
		 return hasCollision;
   }
 }

 return wrapped(rays);
}

/*
 * Modify destination to be the snap point for the token when snap is set.
 * Wrap for Ruler.setDestination from libRuler.
 * @param {Object} wrapped	Wrapped function from libWrapper.
 * @param {Object} destination	The destination point to which to measure. Should have at least x and y properties.
 */
function dragRulerSetDestination(wrapped, destination) {
	const snap = this.getFlag(settingsKey, "snap");
	if(snap) {
		const new_dest = getSnapPointForToken(destination.x, destination.y, this.draggedEntity);
		destination.x = new_dest.x;
		destination.y = new_dest.y;
	}

	wrapped(destination);
}

/*
 * Wrapper for Ruler.moveToken
 * Drag ruler original code breaks this out into two functions;
 *	 - moveToken just adds or deletes waypoints; intercepting the space bar or right-click press
 *	 - moveEntities is basically Ruler.moveToken with modifications
 * To conform to libRuler and Foundry expectations, combine back into single wrap here
 *	 - check a flag to start the actual movement
 * TO-DO: Handle multiple entities
 *				Handle measured template entity
 */
async function dragRulerMoveToken(wrapped) {
	if(!this.isDragRuler) return await wrapped();
	if(this._state === Ruler.STATES.MOVING) {
		return await wrapped();
	} else {
		let options = {};
		setSnapParameterOnOptions(this, options);

		if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
			this._addWaypoint(this.destination, options);
		} else {
			this.dragRulerDeleteWaypoint(event, options);
		}
	}
}

/*
 * Wrapper for Ruler._addWaypoint
 */
function dragRulerAddWaypoint(wrapped, point, center = true) {
	if(!this.isDragRuler) return wrapped(point, center);

	if(center) {
		point = getSnapPointForToken(point.x, point.y, this.draggedEntity);

	}
	return wrapped(point, false);
}


export function dragRulerGetRaysFromWaypoints(waypoints, destination) {
		if ( destination )
			waypoints = waypoints.concat([destination]);
		return waypoints.slice(1).map((wp, i) => {
			const ray =	 new Ray(waypoints[i], wp);
			ray.isPrevious = Boolean(waypoints[i].isPrevious);
			return ray;
		});
	}


/*
 * Wrap for Ruler._getMovementToken()
 */

// See drag ruler original version of moveTokens in foundry_imports.js
function dragRulerGetMovementToken(wrapped) {
	if(!this.isDragRuler) return wrapped();
	return this.draggedEntity;
}

/*
 * Wrap animate token to adjust ray for multiple tokens
 */
function dragRulerAnimateToken(wrapped, token, ray, dx, dy, segment_num) {
  const selectedEntities = canvas.tokens.controlled; // should include the dragged entity, right?
  const draggedEntity = this._getMovementToken();
  const isToken = draggedEntity instanceof Token;
  const animate = isToken && !game.keyboard.isDown("Alt");
  console.log(`drag-ruler|${animate ? "animating" : "not animating"} ${selectedEntities.length} selected tokens`, draggedEntity, selectedEntities)

	const entityAnimationData = selectedEntities.map(entity => {
		const entityOffset = calculateEntityOffset(entity, draggedEntity);
		const offsetRay = applyOffsetToRay(ray, entityOffset)

		return {entity, ray: offsetRay, entityOffset};
	});

	// probably don't want to do this b/c (1) need path from the wrapped function and (2) wrapped function has an update
	// await draggedEntity.scene.updateEmbeddedDocuments(draggedEntity.constructor.embeddedName, updates, {animate});


  console.log(`drag-ruler|Animating ${selectedEntities.length} entities.`, entityAnimationData);
  entityAnimationData.forEach(({entity, ray, entityOffset}) => {
    console.log(`drag-ruler|Animating entity ${entity.name} with offset ${entityOffset.x}, ${entityOffset.y}`, entity, ray);
    //wrapped(entity, ray, ...args);
    wrapped(entity, ray, dx + entityOffset.x, dy + entityOffset.y, segment_num);
  });

  //wrapped(token, ray, ..args);
}

// Wrappers for libRuler RulerSegment methods
function dragRulerAddProperties(wrapped) {
	wrapped();
	if(!this.ruler.isDragRuler) return;

	// center the segments
	// TO-DO: Can Terrain Ruler handle its part separately? So just center everything here?
	// See if (!terrainRulerAvailable) in drag ruler original measure function
	const centeredWaypoints = applyTokenSizeOffset([this.ray.A, this.ray.B], this.ruler.draggedEntity);
	centeredWaypoints.forEach(w => [w.x, w.y] = canvas.grid.getCenter(w.x, w.y));

	this.ray = new Ray(centeredWaypoints[0], centeredWaypoints[1]);

	// can pull origin information from the original waypoints
	// segment 0 would have origin waypoint 0, destination waypoint 1, etc.
	const origin = this.ruler.waypoints[this.segment_num];
	this.ray.isPrevious = Boolean(origin.isPrevious);
	this.ray.dragRulerVisitedSpaces = origin.dragRulerVisitedSpaces;
	this.ray.dragRulerFinalState = origin.dragRulerFinalState;

	// set opacity for drawing the line and the highlight
	const opacity_mult = this.ray.isPrevious ? 0.33 : 1;
	this.opacityMultipliers.line = opacity_mult;
	this.opacityMultipliers.highlight = opacity_mult;
}

// Additions to Ruler class
function addRulerProperties() {
	// Add a getter method to check for drag token in Ruler flags.
	Object.defineProperty(Ruler.prototype, "isDragRuler", {
		get() { return Boolean(this.getFlag(settingsKey, "draggedEntityID")); },
		configurable: true
	});

	// Add a getter method to return the token for the stored token id
	Object.defineProperty(Ruler.prototype, "draggedEntity", {
		get() {
			const draggedEntityID = this.getFlag(settingsKey, "draggedEntityID");
			if(!draggedEntityID) return undefined;
			return canvas.tokens.get(draggedEntityID);
		},
		configurable: true
	});

	Object.defineProperty(Ruler.prototype, "dragRulerAddWaypointHistory", {
		value: dragRulerAddWaypointHistory,
		writable: true,
		configurable: true
	});

	Object.defineProperty(Ruler.prototype, "dragRulerClearWaypoints", {
		value: dragRulerClearWaypoints,
		writable: true,
		configurable: true
	});

	Object.defineProperty(Ruler.prototype, "dragRulerDeleteWaypoint", {
		value: dragRulerDeleteWaypoint,
		writable: true,
		configurable: true
	});

	Object.defineProperty(Ruler.prototype, "dragRulerAbortDrag", {
		value: dragRulerAbortDrag,
		writable: true,
		configurable: true
	});

	Object.defineProperty(Ruler.prototype, "dragRulerRecalculate", {
		value: dragRulerRecalculate,
		writable: true,
		configurable: true
	});

	Object.defineProperty(Ruler, "dragRulerGetRaysFromWaypoints", {
		value: dragRulerGetRaysFromWaypoints,
		writable: true,
		configurable: true
	});
}







