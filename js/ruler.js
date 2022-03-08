import {currentSpeedProvider, getColorForDistanceAndToken, getRangesFromSpeedProvider} from "./api.js";
import {getHexSizeSupportTokenGridCenter} from "./compatibility.js";
import {cancelScheduledMeasurement, measure} from "./foundry_imports.js"
import {getMovementHistory} from "./movement_tracking.js";
import {settingsKey} from "./settings.js";
import {getSnapPointForEntity} from "./util.js";

export function extendRuler() {
	class DragRulerRuler extends Ruler {
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
			// Disable moveToken if Drag Ruler is active
			if (!this.isDragRuler)
				return await super.moveToken(event);
		}

		toJSON() {
			const json = super.toJSON();
			if (this.draggedEntity) {
				const isToken = this.draggedEntity instanceof Token;
				json.draggedEntityIsToken = isToken;
				json.draggedEntity = this.draggedEntity.id;
				json.waypoints = json.waypoints.map(old => {
					let w = duplicate(old);
					w.isPathfinding = undefined;
					return w;
				});
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
			else {
				this.draggedEntity = undefined;
			}

			super.update(data);
		}

		measure(destination, options={}) {
			if (this.isDragRuler) {
				// If this is the ruler of a remote user take the waypoints as they were transmitted and don't apply any additional snapping to them
				if (this.user !== game.user)
					options.snap = false;
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
			this.waypoints.filter(waypoint => waypoint.isPathfinding).forEach(waypoint => waypoint.isPathfinding = false);
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

		dragRulerDeleteWaypoint(event={preventDefault: () => {return}}, options={}) {
			this.dragRulerRemovePathfindingWaypoints();
			options.snap = options.snap ?? true;
			if (this.waypoints.filter(w => !w.isPrevious).length > 1) {
				event.preventDefault();
				const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens);
				const rulerOffset = this.rulerOffset;

				// Options are not passed to _removeWaypoint in vanilla Foundry.
				// Send them in case other modules have overriden that behavior and accept an options parameter (Toggle Snap to Grid)
				this._removeWaypoint({x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y}, options);
				game.user.broadcastActivity({ruler: this});
			}
			else {
				this.dragRulerAbortDrag(event);
			}
		}

		dragRulerRemovePathfindingWaypoints() {
			this.waypoints.filter(waypoint => waypoint.isPathfinding).forEach(_ => this.labels.removeChild(this.labels.children[this.labels.children.length - 1]).destroy());
			this.waypoints = this.waypoints.filter(waypoint => !waypoint.isPathfinding);
		}

		dragRulerAbortDrag(event={preventDefault: () => {return}}) {
			const token = this.draggedEntity;
			this._endMeasurement();

			// Deactivate the drag workflow in mouse
			token.mouseInteractionManager._deactivateDragEvents();
			token.mouseInteractionManager.state = token.mouseInteractionManager.states.HOVER;

			// This will cancel the current drag operation
			// Pass in a fake event that hopefully is enough to allow other modules to function
			token._onDragLeftCancel(event);
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
				this.dragRulerAddWaypoint(waypoint, {snap: false});
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
			return getColorForDistanceAndToken(distance, this.draggedEntity, this.dragRulerRanges) ?? this.color;
		}

		dragRulerStart(options, measureImmediately=true) {
			const entity = this.draggedEntity;
			const isToken = entity instanceof Token;
			if (isToken && !currentSpeedProvider.usesRuler(entity))
				return;
			const ruler = canvas.controls.ruler;
			ruler.clear();
			ruler._state = Ruler.STATES.STARTING;
			let entityCenter;
			if (isToken && canvas.grid.isHex && game.modules.get("hex-size-support")?.active && CONFIG.hexSizeSupport.getAltSnappingFlag(entity))
				entityCenter = getHexSizeSupportTokenGridCenter(entity);
			else
				entityCenter = entity.center;
			if (isToken && game.settings.get(settingsKey, "enableMovementHistory"))
				ruler.dragRulerAddWaypointHistory(getMovementHistory(entity));
			ruler.dragRulerAddWaypoint(entityCenter, {snap: false});
			const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.tokens);
			const destination = {x: mousePosition.x + ruler.rulerOffset.x, y: mousePosition.y + ruler.rulerOffset.y};
			if (measureImmediately)
				ruler.measure(destination, options);
		}

		dragRulerSendState() {
			game.user.broadcastActivity({
				ruler: this.toJSON()
			});
		}
	}

	Ruler = DragRulerRuler;
}
