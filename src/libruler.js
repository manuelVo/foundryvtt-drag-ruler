import "MODULE_ID" from "./libwrapper.js"


export function registerLibRuler() {
  // Wrappers for base Ruler methods
  libWrapper.register(MODULE_ID, "Ruler.prototype.clear", dragRulerClear, "WRAPPER");
  libWrapper.register(MODULE_ID, "Ruler.prototype.update", dragRulerUpdate, "MIXED");
  libWrapper.register(MODULE_ID, "Ruler.prototype._endMeasurement", dragRulerEndMeasurement, "WRAPPER");

  // Wrappers for libRuler Ruler methods
  libWrapper.register(MODULE_ID, "Ruler.prototype.setDestination", dragRulerSetDestination, "WRAPPER");
  libWrapper.register(MODULE_ID, "Ruler.prototype._addWaypoint", dragRulerAddWaypoint, "WRAPPER");
  libWrapper.register(MODULE_ID, "Ruler.prototype.moveToken", dragRulerMoveToken, "MIXED");

  // Wrappers for libRuler RulerSegment methods
}


// Functions copied from ruler.js that were originally in class DragRulerRuler

/*
 * Clear display of the current Ruler.
 * Wrap for Ruler.clear
 */
function dragRulerClear(wrapped) {
  this.setFlag(MODULE_ID, "previousWaypoints", []);
  const previousLabels = this.getFlag(MODULE_ID, "previousLabels");
  previousLabels.removeChildren().forEach(c => c.destroy());
  this.unsetFlag(MODULE_ID, "previousLabels");
  this.unsetFlag(MODULE_ID, "dragRulerRanges");
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
  wrapped();
  this.draggedToken = null;
}



// Wrappers for libRuler Ruler methods

/*
 * Modify destination to be the snap point for the token when snap is set.
 * Wrap for Ruler.setDestination from libRuler.
 * @param {Object} wrapped 	Wrapped function from libWrapper.
 * @param {Object} destination  The destination point to which to measure. Should have at least x and y properties.
 */
function dragRulerSetDestination(wrapped, destination) {
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
  	this.waypoints = [];
		this.labels.removeChildren().forEach(c => c.destroy());
	}


/*
 * New delete waypoints function
 */
function dragRulerDeleteWaypoint(event={preventDefault: () => {return}}) {
		if (this.waypoints.filter(w => !w.isPrevious).length > 1) {
			event.preventDefault();
			const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens);
			const rulerOffset = this.rulerOffset;
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


async function dragRulerMoveToken(wrapped, event) {
  if(!this.isDragRuler) return wrapped(event); // TO-DO: does this need await?

  if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
			const snap = !event.shiftKey;
			this._addWaypoint(this.destination, snap);
	} else {
		  this.dragRulerDeleteWaypoint();
	}
}


// Wrappers for libRuler RulerSegment methods

function dragRulerAddProperties(wrapped) {
  wrapped();
  if(!this.ruler.isDragRuler) return;

  // center waypoints? Or is this really just for terrain ruler?
  // 	const centeredWaypoints = applyTokenSizeOffset(waypoints, this.draggedToken)

  const origin =
  this.ray.isPrevious = Boolean(origin.isPrevious);



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
		ray.dragRulerFinalState = origin.dragRulerFinalState;
		centeredRay.dragRulerFinalState = ray.dragRulerFinalState;


}



function dragRulerDrawLine(wrapped) {
  if(!this.ruler.isDragRuler) return wrapped();
  const opacityMultiplier = this.ray.isPrevious ? 0.33 : 1;
  const ray = this.ray;
  const r = this.ruler.ruler;
  const rulerColor = this.color;

  r.lineStyle(6, 0x000000, 0.5 * opacityMultiplier).moveTo(ray.A.x, ray.A.y).lineTo(ray.B.x, ray.B.y)
			.lineStyle(4, rulerColor, 0.25 * opacityMultiplier).moveTo(ray.A.x, ray.A.y).lineTo.ray.B.x, ray.B.y);
}



// Additions to Ruler class

if(game.modules.get('libruler')?.active) {
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







