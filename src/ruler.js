import {measure} from "./foundry_imports.js"
import {getMovementHistory} from "./movement_tracking.js";
import {settingsKey} from "./settings.js";
import {getSnapPointForEntity} from "./util.js";

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
	}

	async moveToken(event) {
		// This function is invoked by left clicking
		if (!this.isDragRuler)
			return await super.moveToken(event);
		if (!game.settings.get(settingsKey, "swapSpacebarRightClick")) {
			const snap = !event.shiftKey;
			this.dragRulerAddWaypoint(this.destination, snap);
		}
		else {
			this.dragRulerDeleteWaypoint();
		}
	}

	toJSON() {
		const json = super.toJSON();
		if (this.draggedEntity)
			json["draggedEntity"] = this.draggedEntity.id;
		return json;
	}

	update(data) {
		// Don't show a GMs drag ruler to non GM players
		if (data.draggedEntity && this.user.isGM && !game.user.isGM && !game.settings.get(settingsKey, "showGMRulerToPlayers"))
			return;

		if (data.draggedEntity) {
			this.draggedEntity = canvas.tokens.get(data.draggedEntity);
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
	dragRulerAddWaypoint(point, snap=true) {
		if (snap) {
			point = getSnapPointForEntity(point.x, point.y, this.draggedEntity);
		}
		this.waypoints.push(new PIXI.Point(point.x, point.y));
		this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
	}

	dragRulerAddWaypointHistory(waypoints) {
		waypoints.forEach(waypoint => waypoint.isPrevious = true);
		this.waypoints = this.waypoints.concat(waypoints);
		for (const waypoint of waypoints) {
			this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
		}
	}

	dragRulerClearWaypoints() {
		this.waypoints = [];
		this.labels.removeChildren().forEach(c => c.destroy());
	}

	dragRulerDeleteWaypoint(event={preventDefault: () => {return}}) {
		if (this.waypoints.filter(w => !w.isPrevious).length > 1) {
			event.preventDefault();
			const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens);
			const rulerOffset = this.rulerOffset;
			this._removeWaypoint({x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y});
			game.user.broadcastActivity({ruler: this});
		}
		else {
			const token = this.draggedEntity;
			this._endMeasurement();

			// Deactivate the drag workflow in mouse
			token.mouseInteractionManager._deactivateDragEvents();
			token.mouseInteractionManager.state = token.mouseInteractionManager.states.HOVER;

			// This will cancel the current drag operation
			// Pass in a fake event that hopefully is enough to allow other modules to function
			token._onDragLeftCancel(event);
		}
	}

	async dragRulerRecalculate(tokenIds) {
		if (this._state !== Ruler.STATES.MEASURING)
			return;
		if (tokenIds && !tokenIds.includes(this.draggedEntity.id))
			return;
		const waypoints = this.waypoints.filter(waypoint => !waypoint.isPrevious);
		this.dragRulerClearWaypoints();
		if (game.settings.get(settingsKey, "enableMovementHistory"))
			this.dragRulerAddWaypointHistory(getMovementHistory(this.draggedEntity));
		for (const waypoint of waypoints) {
			this.dragRulerAddWaypoint(waypoint, false);
		}
		this.measure(this.destination);
		game.user.broadcastActivity({ruler: this});
	}

	static dragRulerGetRaysFromWaypoints(waypoints, destination) {
		if ( destination )
			waypoints = waypoints.concat([destination]);
		return waypoints.slice(1).map((wp, i) => {
			const ray =  new Ray(waypoints[i], wp);
			ray.isPrevious = Boolean(waypoints[i].isPrevious);
			return ray;
		});
	}
}
