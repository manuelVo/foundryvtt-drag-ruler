import {settingsKey} from "./settings.js"
import { applyTokenSizeOffset, getTokenShape, getSnapPointForToken, setSnapParameterOnOptions } from "./util.js";

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

  // Wrappers for event handlers for testing
  // see what is happening with the various events
  libWrapper.register(settingsKey, "Ruler.prototype._onDragStart", dragRulerOnDragStart, "WRAPPER");
  libWrapper.register(settingsKey, "Ruler.prototype._onClickLeft", dragRulerOnClickLeft, "WRAPPER");
  libWrapper.register(settingsKey, "Ruler.prototype._onClickRight", dragRulerOnClickRight, "WRAPPER");
  libWrapper.register(settingsKey, "Ruler.prototype._onMouseUp", dragRulerOnMouseUp, "WRAPPER");
  libWrapper.register(settingsKey, "KeyboardManager.prototype._onSpace", dragRulerOnSpace, "WRAPPER");

  addRulerProperties();
}

// Wrappers for event handlers for testing
function dragRulerOnDragStart(wrapper, event) {
  log(`Ruler._onDragStart`, event);
  wrapper(event);
}

function dragRulerOnClickLeft(wrapper, event) {
  log(`Ruler._onClickLeft`, event);
  wrapper(event);
}

function dragRulerOnClickRight(wrapper, event) {
  log(`Ruler._onClickRight`, event);
  wrapper(event);
}

/*
 * Defined below
function dragRulerOnMouseMove(wrapper, event) {
  log(`Ruler._onMouseMove`, event);
  wrapper(event);
}
*/

function dragRulerOnMouseUp(wrapper, event) {
  log(`Ruler._onMouseUp`, event);
  wrapper(event);
}

function dragRulerOnSpace(wrapper, up, modifiers) {
  log(`Keyboard._onSpace. up: ${up}`);
  return wrapper(up, modifiers);
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
  this.unsetFlag(settingsKey, "draggedTokenID");
}



// Wrappers for libRuler Ruler methods

/*
 * Wrap for Ruler._onMouseMove
 */

function dragRulerOnMouseMove(wrapped, event) {
  log("dragRulerOnMouseMove");
  if(!this.isDragRuler) return wrapped(event);

  const offset = this.getFlag(settingsKey, "rulerOffset");
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
  const snap = this.getFlag(settingsKey, "snap");
  if(snap) {
    const new_dest = getSnapPointForToken(destination.x, destination.y, this.draggedToken);
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
  log(`dragRulerMoveToken`, event, this);
  if(!this.isDragRuler) return wrapped(event);
  if(this.getFlag(settingsKey, "doTokenMove")) {
		let options = {};
		setSnapParameterOnOptions(this, options);

		if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
			this.dragRulerAddWaypoint(this.destination, options);
		} else {
			this.dragRulerDeleteWaypoint(event, options);
		}
  } else {
    this.setFlag(settingsKey, "doTokenMove", false);
    return wrapped(event);
  }
}

/*
 * Wrapper for Ruler._addWaypoint
 */
// TO-DO: Change libRuler to override _addWaypoint to add a switch for centering
function dragRulerAddWaypoint(wrapped, point, center = true) {
  log("dragRulerAddWaypoint", this);
  if(!this.isDragRuler) return wrapped(point, center);

  if(center) {
    log(`centering ${point.x}, ${point.y}`);
    point = getSnapPointForToken(point.x, point.y, this.draggedToken);

  }
  log(`adding waypoint ${point.x}, ${point.y}`);
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
function dragRulerDeleteWaypoint(event={preventDefault: () => {return}}, options={}) {
  log("dragRulerDeleteWaypoint");
  options.snap = options.snap ?? true;

	if (this.waypoints.filter(w => !w.isPrevious).length > 1) {
		event.preventDefault();
		const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens);
		const rulerOffset = this.getFlag(settingsKey, "rulerOffset");
		this._removeWaypoint({x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y});
		game.user.broadcastActivity({ruler: this});
	}
	else {
		this.dragRulerAbortDrag(event);
	}
}

/*
 * New abort drag function
 */
function dragRulerAbortDrag(event={preventDefault: () => {return}}) {
  	const token = this.draggedEntity;
		this._endMeasurement();

		// Deactivate the drag workflow in mouse
		token.mouseInteractionManager._deactivateDragEvents();
		token.mouseInteractionManager.state = token.mouseInteractionManager.states.HOVER;

		// This will cancel the current drag operation
		// Pass in a fake event that hopefully is enough to allow other modules to function
		token._onDragLeftCancel(event);
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
		get() { return Boolean(this.getFlag(settingsKey, "draggedTokenID")); },
		configurable: true
	});

	// Add a getter method to return the token for the stored token id
	Object.defineProperty(Ruler.prototype, "draggedToken", {
		get() {
			const draggedTokenID = this.getFlag(settingsKey, "draggedTokenID");
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

}







