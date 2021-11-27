import {getColorForDistanceAndToken, getRangesFromSpeedProvider} from "./api.js";
import {cancelScheduledMeasurement, measure} from "./foundry_imports.js"
import {getMovementHistory} from "./movement_tracking.js";
import {settingsKey} from "./settings.js";
import {getSnapPointForEntity, setSnapParameterOnOptions} from "./util.js";

export class DragRulerRuler extends Ruler {
	// Functions below are overridden versions of functions in Ruler
	constructor(user, {color=null}={}) {
		super(user, {color});
		this.previousWaypoints = [];
		this.previousLabels = this.addChild(new PIXI.Container());
	}

	clear() {
		super.clear();
		this.previousWaypoints = [];
		this.previousLabels.removeChildren().forEach(c => c.destroy());
		this.dragRulerRanges = undefined;
		cancelScheduledMeasurement.call(this);
	}

	async moveToken(event) {
		// This function is invoked by left clicking
		if (!this.isDragRuler)
			return await super.moveToken(event);

		let options = {};
		setSnapParameterOnOptions(this, options);

		if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
			this.dragRulerAddWaypoint(this.destination, options);
		}
		else {
			this.dragRulerDeleteWaypoint(event, options);
		}
	}

	toJSON() {
		const json = super.toJSON();
		if (this.draggedEntity) {
			const isToken = this.draggedEntity instanceof Token;
			json["draggedEntityIsToken"] = isToken;
			json["draggedEntity"] = this.draggedEntity.id;
		}
		return json;
	}

	update(data) {
		// Don't show a GMs drag ruler to non GM players
		if (data.draggedEntity && this.user.isGM && !game.user.isGM && !game.settings.get(settingsKey, "showGMRulerToPlayers"))
			return;

		if (data.draggedEntity) {
			if (data.draggedEntityIsToken)
				this.draggedEntity = canvas.tokens.get(data.draggedEntity);
			else
				this.draggedEntity = canvas.templates.get(data.draggedEntity);
		}

		super.update(data);
	}

	measure(destination, options={}) {
		if (this.isDragRuler) {
			return measure.call(this, destination, options);
		}
		else {
			return super.measure(destination, options);
		}
	}

	_endMeasurement() {
		super._endMeasurement();
		this.draggedEntity = null;
	}

	// The functions below aren't present in the orignal Ruler class and are added by Drag Ruler
	dragRulerAddWaypoint(point, options={}) {
		options.snap = options.snap ?? true;
		if (options.snap) {
			point = getSnapPointForEntity(point.x, point.y, this.draggedEntity);
		}
		this.waypoints.push(new PIXI.Point(point.x, point.y));
		this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
	}

	dragRulerGetColorForDistance(distance) {
		if (!this.isDragRuler)
			return this.color;
		if (!this.draggedEntity.actor) {
			return this.color;
		}
		// Don't apply colors if the current user doesn't have at least observer permissions
		if (this.draggedEntity.actor.permission < 2) {
			// If this is a pc and alwaysShowSpeedForPCs is enabled we show the color anyway
			if (!(this.draggedEntity.actor.data.type === "character" && game.settings.get(settingsKey, "alwaysShowSpeedForPCs")))
				return this.color;
		}
		distance = Math.round(distance * 100) / 100;
		if (!this.dragRulerRanges)
			this.dragRulerRanges = getRangesFromSpeedProvider(this.draggedEntity);
		return getColorForDistanceAndToken(distance, this.draggedEntity, this.dragRulerRanges);
	}
}

// export following for use in libruler code as well as here.

export function dragRulerAddWaypointHistory(waypoints) {
		waypoints.forEach(waypoint => waypoint.isPrevious = true);
		this.waypoints = this.waypoints.concat(waypoints);
		for (const waypoint of waypoints) {
			this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
		}
	}

export function dragRulerClearWaypoints() {
		this.waypoints = [];
		this.labels.removeChildren().forEach(c => c.destroy());
	}

export function dragRulerDeleteWaypoint(event={preventDefault: () => {return}}, options={}) {
		options.snap = options.snap ?? true;
		if (this.waypoints.filter(w => !w.isPrevious).length > 1) {
			event.preventDefault();
			const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens);
			const rulerOffset = game.modules.get('libruler')?.active ? this.getFlag(settingsKey, "rulerOffset") : this.rulerOffset;

			// Options are not passed to _removeWaypoint in vanilla Foundry.
			// Send them in case other modules have overriden that behavior and accept an options parameter (Toggle Snap to Grid)
			this._removeWaypoint({x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y}, options);
			game.user.broadcastActivity({ruler: this});
		}
		else {
			this.dragRulerAbortDrag(event);
		}
	}

export function dragRulerAbortDrag(event={preventDefault: () => {return}}) {
		const token = this.draggedEntity;
		this._endMeasurement();

		// Deactivate the drag workflow in mouse
		token.mouseInteractionManager._deactivateDragEvents();
		token.mouseInteractionManager.state = token.mouseInteractionManager.states.HOVER;

		// This will cancel the current drag operation
		// Pass in a fake event that hopefully is enough to allow other modules to function
		token._onDragLeftCancel(event);
	}

export async function dragRulerRecalculate(tokenIds) {
		if (this._state !== Ruler.STATES.MEASURING)
			return;
		if (tokenIds && !tokenIds.includes(this.draggedEntity.id))
			return;
		const waypoints = this.waypoints.filter(waypoint => !waypoint.isPrevious);
		this.dragRulerClearWaypoints();
		if (game.settings.get(settingsKey, "enableMovementHistory"))
			this.dragRulerAddWaypointHistory(getMovementHistory(this.draggedEntity));
		for (const waypoint of waypoints) {
			if(game.modules.get('libruler')?.active) {
				this._addWaypoint(waypoint, false);
			} else {
				this.dragRulerAddWaypoint(waypoint, {snap: false});
			}
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

Object.defineProperty(DragRulerRuler.prototype, "dragRulerAddWaypointHistory", {
	value: dragRulerAddWaypointHistory,
	writable: true,
	configurable: true
});

Object.defineProperty(DragRulerRuler.prototype, "dragRulerClearWaypoints", {
	value: dragRulerClearWaypoints,
	writable: true,
	configurable: true
});

Object.defineProperty(DragRulerRuler.prototype, "dragRulerDeleteWaypoint", {
	value: dragRulerDeleteWaypoint,
	writable: true,
	configurable: true
});

Object.defineProperty(DragRulerRuler.prototype, "dragRulerAbortDrag", {
	value: dragRulerAbortDrag,
	writable: true,
	configurable: true
});

Object.defineProperty(DragRulerRuler.prototype, "dragRulerRecalculate", {
	value: dragRulerRecalculate,
	writable: true,
	configurable: true
});

Object.defineProperty(DragRulerRuler, "dragRulerGetRaysFromWaypoints", {
	value: dragRulerGetRaysFromWaypoints,
	writable: true,
	configurable: true
});
