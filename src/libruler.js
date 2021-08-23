import { MODULE_ID } from "./libwrapper.js"
import { applyTokenSizeOffset, getTokenShape } from "./util.js";

export function registerLibRuler() {
  // Wrappers for base Ruler methods
  libWrapper.register(MODULE_ID, "Ruler.prototype.clear", dragRulerClear, "WRAPPER");
  libWrapper.register(MODULE_ID, "Ruler.prototype.update", dragRulerUpdate, "MIXED");
  libWrapper.register(MODULE_ID, "Ruler.prototype._endMeasurement", dragRulerEndMeasurement, "WRAPPER");
  libWrapper.register(MODULE_ID, "Ruler.prototype._onMouseMove", dragRulerOnMouseMove, "WRAPPER");
  libWrapper.register(MODULE_ID, "Ruler.prototype._getMovementToken", dragRulerGetMovementToken, "MIXED");

  // Wrappers for libRuler Ruler methods
  libWrapper.register(MODULE_ID, "Ruler.prototype.setDestination", dragRulerSetDestination, "WRAPPER");
  libWrapper.register(MODULE_ID, "Ruler.prototype._addWaypoint", dragRulerAddWaypoint, "WRAPPER");

  // Wrappers for libRuler RulerSegment methods
  libWrapper.register(MODULE_ID, "window.libRuler.RulerSegment.prototype.addProperties", dragRulerAddProperties, "WRAPPER");
  libWrapper.register(MODULE_ID, "window.libRuler.RulerSegment.prototype.drawLine", dragRulerDrawLine, "MIXED");
  libWrapper.register(MODULE_ID, "window.libRuler.RulerSegment.prototype.highlightPosition", dragRulerHighlightPosition, "MIXED");

  addRulerProperties();
}

export function log(...args) {
  try {
      console.log(MODULE_ID, '|', ...args);
  } catch (e) {}
}


// Functions copied from ruler.js that were originally in class DragRulerRuler

/*
 * Clear display of the current Ruler.
 * Wrap for Ruler.clear
 */
function dragRulerClear(wrapped) {
  //this.setFlag(MODULE_ID, "previousWaypoints", []);
  //const previousLabels = this.getFlag(MODULE_ID, "previousLabels");
  //previousLabels.removeChildren().forEach(c => c.destroy());
  //this.unsetFlag(MODULE_ID, "previousLabels");
  //this.unsetFlag(MODULE_ID, "dragRulerRanges");
  log("Clear.");
  wrapped();
}


/*
 * Modify update to avoid showing a GM drag ruler to non-GM players.
 * Wrap for Ruler.update
 */
function dragRulerUpdate(wrapped, data) {
  if(data.flags['drag-ruler'].draggedToken && data.draggedToken && this.user.isGM && !game.user.isGM && !game.settings.get(settingsKey, "showGMRulerToPlayers"))
			return;

  wrapped(data);
}

/*
 * clean up after measuring
 */
function dragRulerEndMeasurement(wrapped) {
  log("EndMeasurement");
  wrapped();
  this.unsetFlag(MODULE_ID, "draggedTokenID");
}



// Wrappers for libRuler Ruler methods

/*
 * Wrap for Ruler._onMouseMove
 */

function dragRulerOnMouseMove(wrapped, event) {
  log("dragRulerOnMouseMove");
  if(!this.isDragRuler) return wrapped(event);

  // TO-DO: Confirm that we need to offset origin as well as destination here.
  const offset = this.getFlag(MODULE_ID, "rulerOffset");
  event.data.origin.x = event.data.origin.x + offset.x;
  event.data.origin.y = event.data.origin.y + offset.y;

  event.data.destination.x = event.data.destination.x + offset.x;
  event.data.destination.y = event.data.destination.y + offset.y;

  wrapped(event);
  // FYI: original drag ruler version calls this.measure with {snap: !originalEvent.shiftKey}, not {gridSpace: !originalEvent.shiftKey}
}

/*
 * Modify destination to be the snap point for the token when snap is set.
 * Wrap for Ruler.setDestination from libRuler.
 * @param {Object} wrapped 	Wrapped function from libWrapper.
 * @param {Object} destination  The destination point to which to measure. Should have at least x and y properties.
 */
function dragRulerSetDestination(wrapped, destination) {
  log("dragRulerSetDestination");
  const snap = this.getFlag(MODULE_ID, "snap");
  if(snap) {
    const new_dest = getSnapPointForToken(destination.x, destination.y, this.draggedToken);
    destination.x = new_dest.x;
    destination.y = new_dest.y;
  }

  wrapped(destination);
}

/*
 * Wrapper for Ruler._addWaypoint
 */
// TO-DO: Change libRuler to override _addWaypoint to add a switch for centering
function dragRulerAddWaypoint(wrapped, point, center = true) {
  log("dragRulerAddWaypoint");
  if(!this.isDragRuler) return wrapped(point, center);

  if(center) {
    point = getSnapPointForToken(point.x, point.y, this.draggedToken);
  }
  return wrapped(point, false);
}

/*
 * New waypoint history function
 */
function dragRulerAddWaypointHistory(waypoints) {
  log("dragRulerAddWaypointHistory");
		waypoints.forEach(waypoint => waypoint.isPrevious = true);
		this.waypoints = this.waypoints.concat(waypoints);
		for (const waypoint of waypoints) {
			this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
		}
	}

/*
 * New clear waypoints function
 */
function dragRulerClearWaypoints() {
  log("dragRulerClearWaypoints");
  	this.waypoints = [];
		this.labels.removeChildren().forEach(c => c.destroy());
	}


/*
 * New delete waypoints function
 */
function dragRulerDeleteWaypoint(event={preventDefault: () => {return}}) {
  log("dragRulerDeleteWaypoint");

		if (this.waypoints.filter(w => !w.isPrevious).length > 1) {
			event.preventDefault();
			const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens);
			const rulerOffset = this.getFlag(MODULE_ID, "rulerOffset");
			this._removeWaypoint({x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y});
			game.user.broadcastActivity({ruler: this});
		}
		else {
			const token = this.draggedToken;
			this._endMeasurement();

			// Deactivate the drag workflow in mouse
			token.mouseInteractionManager._deactivateDragEvents();
			token.mouseInteractionManager.state = token.mouseInteractionManager.states.HOVER;

			// This will cancel the current drag operation
			// Pass in a fake event that hopefully is enough to allow other modules to function
			token._onDragLeftCancel(event);
		}
	}

/*
 * New recalculate function
 */
async function dragRulerRecalculate(tokenIds) {
  log("dragRulerRecalculate");
	if (this._state !== Ruler.STATES.MEASURING)
		return;

	const dragged_token = this.draggedToken;

	if (tokenIds && !tokenIds.includes(dragged_token.id))
		return;
	const waypoints = this.waypoints.filter(waypoint => !waypoint.isPrevious);
	this.dragRulerClearWaypoints();
	if (game.settings.get(settingsKey, "enableMovementHistory"))
		this.dragRulerAddWaypointHistory(getMovementHistory(dragged_token));
	for (const waypoint of waypoints) {
		this.addWaypoint(waypoint, false);
	}
	this.measure(this.destination);
	game.user.broadcastActivity({ruler: this});
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
  return this.draggedToken;
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
  const centeredWaypoints = applyTokenSizeOffset([this.ray.A, this.ray.B], this.ruler.draggedToken);
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

  const shape = getTokenShape(this.ruler.draggedToken);
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
		get() { return Boolean(this.getFlag(MODULE_ID, "draggedTokenID")); },
		configurable: true
	});

	// Add a getter method to return the token for the stored token id
	Object.defineProperty(Ruler.prototype, "draggedToken", {
		get() {
			const draggedTokenID = this.getFlag(MODULE_ID, "draggedTokenID");
			if(!draggedTokenID) return undefined;
			return canvas.tokens.get(draggedTokenID);
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

	Object.defineProperty(Ruler.prototype, "dragRulerRecalculate", {
	  value: dragRulerRecalculate,
	  writable: true,
	  configurable: true
	});
}







