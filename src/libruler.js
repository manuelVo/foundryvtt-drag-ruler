import {settingsKey} from "./settings.js"
import { applyTokenSizeOffset, getTokenShape, getSnapPointForToken, setSnapParameterOnOptions } from "./util.js";
import { dragRulerAddWaypointHistory,
         dragRulerClearWaypoints,
         dragRulerDeleteWaypoint,
         dragRulerAbortDrag,
         dragRulerRecalculate } from "./ruler.js";

import { cancelScheduledMeasurement } from "./foundry_imports.js";

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

  // Wrappers for libRuler RulerSegment methods
  libWrapper.register(settingsKey, "window.libRuler.RulerSegment.prototype.addProperties", dragRulerAddProperties, "WRAPPER");
  libWrapper.register(settingsKey, "window.libRuler.RulerSegment.prototype.drawLine", dragRulerDrawLine, "MIXED");
  libWrapper.register(settingsKey, "window.libRuler.RulerSegment.prototype.highlightPosition", dragRulerHighlightPosition, "MIXED");

  addRulerProperties();

  // tell libWrapper that it can ignore the conflict warning from drag ruler not always calling
  // the underlying method for Ruler.moveToken. (i.e., drag ruler interrupts it
  // if just adding or deleting a waypoint)
  libWrapper.ignore_conflicts(settingsKey, "libruler", "Ruler.prototype.moveToken");

}

export function log(...args) {
  try {
      console.log(settingsKey, '|', ...args);
  } catch (e) {}
}


// Functions copied from ruler.js that were originally in class DragRulerRuler

/*
 * Clear display of the current Ruler.
 * Wrap for Ruler.clear
 */
function dragRulerClear(wrapped) {
  //this.setFlag(settingsKey, "previousWaypoints", []);
  //const previousLabels = this.getFlag(settingsKey, "previousLabels");
  //previousLabels.removeChildren().forEach(c => c.destroy());
  //this.unsetFlag(settingsKey, "previousLabels");
  //this.unsetFlag(settingsKey, "dragRulerRanges");
  log("Clear");
  cancelScheduledMeasurement.call(this);
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
  log("EndMeasurement");
  this.unsetFlag(settingsKey, "draggedEntityID");
  this.unsetFlag(settingsKey, "rulerOffset");
  wrapped();
}



// Wrappers for libRuler Ruler methods

/*
 * Wrap for Ruler._onMouseMove
 */

function dragRulerOnMouseMove(wrapped, event) {
  log("dragRulerOnMouseMove");

  if(!this.isDragRuler) return wrapped(event);
  if(this._state === Ruler.STATES.MOVING) return wrapped(event);

  const mt = event._measureTime || 0;
  const rulerOffset = this.getFlag(settingsKey, "rulerOffset");
  event.data.destination.x = event.data.destination.x + rulerOffset.x;
  event.data.destination.y = event.data.destination.y + rulerOffset.y;
  const {origin, destination, originalEvent} = event.data; // in case we need it after wrap

  wrapped(event);
  // FYI: original drag ruler version calls this.measure with {snap: !originalEvent.shiftKey}, not {gridSpace: !originalEvent.shiftKey}

  // handle deferred measurements
  // drag ruler commit 3cbe41e2be7b4ca8dabcf98094caad15a321ddc0
  //   If a measurement is being skipped because of the ruler's rate limiting,
  //   schedule the measurement for later to ensure the ruler sticks to the token
  // a bit tricky b/c we want to use a wrap if at all possible.
  // but we cannot easily tell if _onMouseMove returned early or not.
  // looks like _onMouseMove sets event._measureTime to the Date.now() if updating
  // otherwise, event._measureTime is either undefined or the prior set time at start
  // cheating a bit to use such information, but prefer wrap to not wrap.

  if(event._measureTime & mt !== event._measureTime) {
    // a measurement update occurred
    cancelScheduledMeasurement.call(this);
  } else {
    // either we did not move 1/4 grid space or Date.now() - mt <= 50
    // and so event._measureTime not updated
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const distance = Math.hypot(dy, dx);
    if ( !this.waypoints.length && (distance < (canvas.dimensions.size / 4))) return;

    const measurementInterval = 50;
    this.deferredMeasurementData = {destination, event};
		if (!this.deferredMeasurementTimeout) {
			this.deferredMeasurementPromise = new Promise((resolve, reject) => this.deferredMeasurementResolve = resolve);
			this.deferredMeasurementTimeout = window.setTimeout(() => scheduleMeasurement.call(this, this.deferredMeasurementData.destination, this.deferredMeasurementData.event), measurementInterval);
		}
  }
}

/*
 * Modify destination to be the snap point for the token when snap is set.
 * Wrap for Ruler.setDestination from libRuler.
 * @param {Object} wrapped 	Wrapped function from libWrapper.
 * @param {Object} destination  The destination point to which to measure. Should have at least x and y properties.
 */
function dragRulerSetDestination(wrapped, destination) {
  log("dragRulerSetDestination");
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
 *   - moveToken just adds or deletes waypoints; intercepting the space bar or right-click press
 *   - moveEntities is basically Ruler.moveToken with modifications
 * To conform to libRuler and Foundry expectations, combine back into single wrap here
 *   - check a flag to start the actual movement
 * TO-DO: Handle multiple entities
 *        Handle measured template entity
 */
async function dragRulerMoveToken(wrapped) {
  log(`dragRulerMoveToken`, this);
  if(!this.isDragRuler) return await wrapped();
  if(this._state === Ruler.STATES.MOVING) {
    log(`Moving token`);
    return await wrapped();
  } else {
    let options = {};
    setSnapParameterOnOptions(this, options);

    if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
      log(`Adding waypoint`);
      this._addWaypoint(this.destination, options);
    } else {
      log(`Deleting waypoint`);
      this.dragRulerDeleteWaypoint(event, options);
    }
  }
}

/*
 * Wrapper for Ruler._addWaypoint
 */
function dragRulerAddWaypoint(wrapped, point, center = true) {
  log("dragRulerAddWaypoint", this);
  if(!this.isDragRuler) return wrapped(point, center);

  if(center) {
    log(`centering ${point.x}, ${point.y}`);
    point = getSnapPointForToken(point.x, point.y, this.draggedEntity);

  }
  log(`adding waypoint ${point.x}, ${point.y}`);
  return wrapped(point, false);
}


export function dragRulerGetRaysFromWaypoints(waypoints, destination) {
		if ( destination )
			waypoints = waypoints.concat([destination]);
		return waypoints.slice(1).map((wp, i) => {
			const ray =  new Ray(waypoints[i], wp);
			ray.isPrevious = Boolean(waypoints[i].isPrevious);
			return ray;
		});
	}


/*
 * Wrap for Ruler._getMovementToken()
 */


// TO-DO: Deal with selected tokens and collisions
// See drag ruler original version of moveTokens in foundry_imports.js
function dragRulerGetMovementToken(wrapped) {
  log("dragRulerGetMovementToken");
  if(!this.isDragRuler) return wrapped();
  return this.draggedEntity;
}

// TO-DO: Deal with token animation and multiple selected token animation
// See drag ruler original version of animateTokens; compare to libRulerAnimateToken



// Wrappers for libRuler RulerSegment methods

function dragRulerAddProperties(wrapped) {
  log("dragRulerAddProperties");
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

  // TO-DO: Is there any need to store the original ray? What about when drawing lines (see original drag ruler measure function)
}


function dragRulerHighlightPosition(wrapped, position) {
  log(`dragRulerHighlightPosition position ${position.x}, ${position.y}`, position);
  if(!this.ruler.isDragRuler) return wrapped(position);

  const shape = getTokenShape(this.ruler.draggedEntity);
  const color = this.colorForPosition(position);
  const alpha = this.ray.isPrevious ? 0.33 : 1;

  // TO-DO: can we just use this.ruler.name instead of layer?
  // TO-DO: have highlightPosition take in optional alpha and color
  const layer = canvas.grid.highlightLayers[this.name];
  if ( !layer ) return false;

  const area = getAreaFromPositionAndShape(position, shape);
  for (const space of area) {
		const [x, y] = getPixelsFromGridPosition(space.x, space.y);
		canvas.grid.grid.highlightGridPosition(layer, {x, y, color, alpha: 0.25 * alpha});
	}

}

function dragRulerDrawLine(wrapped) {
  log(`dragRulerDrawLine`);
  if(!this.ruler.isDragRuler) return wrapped();
  const opacityMultiplier = this.ray.isPrevious ? 0.33 : 1;
  const ray = this.ray;
  const r = this.ruler.ruler;
  const rulerColor = this.color;

  r.lineStyle(6, 0x000000, 0.5 * opacityMultiplier).moveTo(ray.A.x, ray.A.y).lineTo(ray.B.x, ray.B.y).
    lineStyle(4, rulerColor, 0.25 * opacityMultiplier).moveTo(ray.A.x, ray.A.y).lineTo(ray.B.x, ray.B.y);
}



// Additions to Ruler class
function addRulerProperties() {
  log(`addRulerProperties`);
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







