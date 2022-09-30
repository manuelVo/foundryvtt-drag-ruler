import {
	currentSpeedProvider,
	getColorForDistanceAndToken,
	getRangesFromSpeedProvider,
} from "./api.js";
import {
	getHexSizeSupportTokenGridCenter,
	highlightMeasurementTerrainRuler,
	measureDistances,
} from "./compatibility.js";
import {getGridPositionFromPixelsObj, getPixelsFromGridPositionObj} from "./foundry_fixes.js";
import {cancelScheduledMeasurement, highlightMeasurementNative} from "./foundry_imports.js";
import {disableSnap} from "./keybindings.js";
import {getMovementHistory} from "./movement_tracking.js";
import {settingsKey} from "./settings.js";
import {
	applyTokenSizeOffset,
	getSnapPointForEntity,
	getSnapPointForTokenObj,
	getTokenShape,
	isPathfindingEnabled,
} from "./util.js";

export function extendRuler() {
	class DragRulerRuler extends CONFIG.Canvas.rulerClass {
		// Functions below are overridden versions of functions in Ruler
		constructor(user, {color = null} = {}) {
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
			if (!this.isDragRuler) return await super.moveToken(event);
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
			if (
				data.draggedEntity &&
				this.user.isGM &&
				!game.user.isGM &&
				!game.settings.get(settingsKey, "showGMRulerToPlayers")
			)
				return;

			if (data.draggedEntity) {
				if (data.draggedEntityIsToken) this.draggedEntity = canvas.tokens.get(data.draggedEntity);
				else this.draggedEntity = canvas.templates.get(data.draggedEntity);
			} else {
				this.draggedEntity = undefined;
			}

			super.update(data);
		}

		measure(destination, options = {}) {
			if (!this.isDragRuler) {
				return super.measure(destination, options);
			}
			if (options.gridSpaces === undefined) {
				options.gridSpaces = canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS;
			}
			this.dragRulerGridSpaces = options.gridSpaces;
			const isToken = this.draggedEntity instanceof Token;
			if (isToken && !this.draggedEntity.isVisible) {
				return [];
			}
			if (canvas.grid.diagonalRule === "EUCL") {
				options.gridSpaces = false;
				options.ignoreGrid = true;
			}
			if (options.ignoreGrid === undefined) {
				options.ignoreGrid = false;
			}
			this.dragRulerIgnoreGrid = options.ignoreGrid;
			// If this is the ruler of a remote user take the waypoints as they were transmitted and don't apply any additional snapping to them
			if (this.user !== game.user) {
				options.snap = false;
			}
			this.dragRulerSnap = options.snap ?? !disableSnap;
			this.dragRulerEnableTerrainRuler = isToken && window.terrainRuler;

			// Compute the measurement destination, segments, and distance
			const d = this._getMeasurementDestination(destination);
			if (d.x === this.destination.x && d.y === this.destination.y) return;
			this.destination = d;

			// TODO Cancel running pathfinding operations
			// TODO Check if we can reuse the old path
			this.dragRulerRemovePathfindingWaypoints();

			if (isToken && isPathfindingEnabled.call(this)) {
				// TODO Show a busy indicator
				const from = getGridPositionFromPixelsObj(this.waypoints[this.waypoints.length - 1]);
				const to = getGridPositionFromPixelsObj(destination);

				return routinglib
					.calculatePath(from, to, {token: this.draggedEntity})
					.then(result => this.addPathToWaypoints(result.path))
					.then(() => this.performPostPathfindingActions(options));
			}

			return this.performPostPathfindingActions(options);
		}

		addPathToWaypoints(path) {
			path = path.map(point =>
				getSnapPointForTokenObj(getPixelsFromGridPositionObj(point), this.draggedEntity),
			);

			// If the token is snapped to the grid, the first point of the path is already handled by the ruler
			if (
				path[0].x === this.waypoints[this.waypoints.length - 1].x &&
				path[0].y === this.waypoints[this.waypoints.length - 1].y
			) {
				path = path.slice(1);
			}

			// If snapping is enabled, the last point of the path is already handled by the ruler
			if (this.dragRulerSnap) {
				path = path.slice(0, path.length - 1);
			}

			for (const point of path) {
				point.isPathfinding = true;
				this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
			}
			this.waypoints = this.waypoints.concat(path);
		}

		performPostPathfindingActions(options) {
			// TODO Clear pathfinding busy indicator
			this.segments = this._getMeasurementSegments();
			this._computeDistance(options.gridSpaces);

			// Draw the ruler graphic
			this.ruler.clear();
			this._drawMeasuredPath();

			// Draw grid highlight
			this.highlightLayer.clear();
			const isToken = this.draggedEntity instanceof Token;
			if (isToken && canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS && this.dragRulerGridSpaces) {
				const shape = getTokenShape(this.draggedEntity);
				if (!this.dragRulerEnableTerrainRuler) {
					for (const [i, segment] of [...this.segments].reverse().entries()) {
						const opacityMultiplier = segment.ray.isPrevious ? 0.33 : 1;
						const previousSegments = this.segments.slice(0, this.segments.length - 1 - i);
						highlightMeasurementNative.call(
							this,
							segment.ray,
							previousSegments,
							shape,
							opacityMultiplier,
						);
					}
				} else {
					for (const segment of [...this.segments].reverse()) {
						const opacityMultiplier = segment.ray.isPrevious ? 0.33 : 1;
						highlightMeasurementTerrainRuler.call(
							this,
							segment.ray,
							segment.startDistance,
							shape,
							opacityMultiplier,
						);
					}
				}
			}
			return this.segments;
		}

		_getMeasurementDestination(destination) {
			if (this.isDragRuler) {
				if (this.dragRulerSnap) {
					return getSnapPointForEntity(destination.x, destination.y, this.draggedEntity);
				} else {
					return destination;
				}
			} else {
				return super._getMeasurementDestination(destination);
			}
		}

		_getMeasurementSegments() {
			if (this.isDragRuler) {
				const unsnappedWaypoints = this.waypoints.concat([this.destination]);
				const waypoints =
					this.draggedEntity instanceof Token
						? applyTokenSizeOffset(unsnappedWaypoints, this.draggedEntity)
						: duplicate(unsnappedWaypoints);
				const unsnappedSegments = [];
				const segments = [];
				for (const [i, p1] of waypoints.entries()) {
					if (i === 0) continue;
					const unsnappedP1 = unsnappedWaypoints[i];
					const p0 = waypoints[i - 1];
					const unsnappedP0 = unsnappedWaypoints[i - 1];
					const label = this.labels.children[i - 1];
					const ray = new Ray(p0, p1);
					const unsnappedRay = new Ray(unsnappedP0, unsnappedP1);
					ray.isPrevious = Boolean(unsnappedP0.isPrevious);
					unsnappedRay.isPrevious = ray.isPrevious;
					ray.dragRulerVisitedSpaces = unsnappedP0.dragRulerVisitedSpaces;
					unsnappedRay.dragRulerVisitedSpaces = ray.dragRulerVisitedSpaces;
					ray.dragRulerFinalState = unsnappedP0.dragRulerFinalState;
					unsnappedRay.dragRulerFinalState = ray.dragRulerFinalState;
					if (ray.distance < 10) {
						if (label) label.visible = false;
						continue;
					}
					segments.push({ray, label});
					unsnappedSegments.push({ray: unsnappedRay, label});
				}
				this.dragRulerUnsnappedSegments = unsnappedSegments;
				return segments;
			} else {
				return super._getMeasurementSegments();
			}
		}

		_computeDistance(gridSpaces) {
			if (!this.isDragRuler) {
				return super._computeDistance(gridSpaces);
			}
			if (!this.dragRulerEnableTerrainRuler) {
				if (!this.dragRulerIgnoreGrid) {
					gridSpaces = true;
				}
				super._computeDistance(gridSpaces);
			} else {
				const shape = this.draggedEntity ? getTokenShape(this.draggedEntity) : null;
				const options = {
					ignoreGrid: this.dragRulerIgnoreGrid,
					gridSpaces,
					enableTerrainRuler: this.dragRulerEnableTerrainRuler,
				};
				const distances = measureDistances(this.segments, this.draggedEntity, shape, options);
				let totalDistance = 0;
				for (const [i, d] of distances.entries()) {
					let s = this.segments[i];
					s.startDistance = totalDistance;
					totalDistance += d;
					s.last = i === this.segments.length - 1;
					s.distance = d;
					s.text = this._getSegmentLabel(s, totalDistance);
				}
			}
			for (const [i, segment] of this.segments.entries()) {
				const unsnappedSegment = this.dragRulerUnsnappedSegments[i];
				unsnappedSegment.startDistance = segment.startDistance;
				unsnappedSegment.last = segment.last;
				unsnappedSegment.distance = segment.distance;
				unsnappedSegment.text = segment.text;
			}
		}

		_drawMeasuredPath() {
			if (!this.isDragRuler) {
				return super._drawMeasuredPath();
			}
			let rulerColor = this.color;
			if (!this.dragRulerGridSpaces || canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
				const totalDistance = this.segments.reduce((total, current) => total + current.distance, 0);
				rulerColor = this.dragRulerGetColorForDistance(totalDistance);
			}
			const r = this.ruler.beginFill(rulerColor, 0.25);
			for (const segment of this.dragRulerUnsnappedSegments) {
				const opacityMultiplier = segment.ray.isPrevious ? 0.33 : 1;
				const {ray, distance, label, text, last} = segment;
				if (distance === 0) continue;

				// Draw Line
				r.moveTo(ray.A.x, ray.A.y)
					.lineStyle(6, 0x000000, 0.5 * opacityMultiplier)
					.lineTo(ray.B.x, ray.B.y)
					.lineStyle(4, rulerColor, 0.25 * opacityMultiplier)
					.moveTo(ray.A.x, ray.A.y)
					.lineTo(ray.B.x, ray.B.y);

				// Draw Waypoints
				r.lineStyle(2, 0x000000, 0.5).drawCircle(ray.A.x, ray.A.y, 8);
				if (last) r.drawCircle(ray.B.x, ray.B.y, 8);

				// Draw Label
				if (label) {
					label.text = text;
					label.alpha = last ? 1.0 : 0.5;
					label.visible = true;
					let labelPosition = ray.project((ray.distance + 50) / ray.distance);
					label.position.set(labelPosition.x, labelPosition.y);
				}
			}
			r.endFill();
		}

		_endMeasurement() {
			super._endMeasurement();
			this.draggedEntity = null;
		}

		// The functions below aren't present in the orignal Ruler class and are added by Drag Ruler
		dragRulerAddWaypoint(point, options = {}) {
			options.snap = options.snap ?? true;
			if (options.snap) {
				point = getSnapPointForEntity(point.x, point.y, this.draggedEntity);
			}
			this.waypoints.push(new PIXI.Point(point.x, point.y));
			this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
			this.waypoints
				.filter(waypoint => waypoint.isPathfinding)
				.forEach(waypoint => (waypoint.isPathfinding = false));
		}

		dragRulerAddWaypointHistory(waypoints) {
			waypoints.forEach(waypoint => (waypoint.isPrevious = true));
			this.waypoints = this.waypoints.concat(waypoints);
			for (const waypoint of waypoints) {
				this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
			}
		}

		dragRulerClearWaypoints() {
			this.waypoints = [];
			this.labels.removeChildren().forEach(c => c.destroy());
		}

		dragRulerDeleteWaypoint(
			event = {
				preventDefault: () => {
					return;
				},
			},
			options = {},
		) {
			this.dragRulerRemovePathfindingWaypoints();
			options.snap = options.snap ?? true;
			if (this.waypoints.filter(w => !w.isPrevious).length > 1) {
				event.preventDefault();
				const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(
					canvas.tokens,
				);
				const rulerOffset = this.rulerOffset;

				// Options are not passed to _removeWaypoint in vanilla Foundry.
				// Send them in case other modules have overriden that behavior and accept an options parameter (Toggle Snap to Grid)
				this._removeWaypoint(
					{x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y},
					options,
				);
				game.user.broadcastActivity({ruler: this});
			} else {
				this.dragRulerAbortDrag(event);
			}
		}

		dragRulerRemovePathfindingWaypoints() {
			this.waypoints
				.filter(waypoint => waypoint.isPathfinding)
				.forEach(_ =>
					this.labels.removeChild(this.labels.children[this.labels.children.length - 1]).destroy(),
				);
			this.waypoints = this.waypoints.filter(waypoint => !waypoint.isPathfinding);
		}

		dragRulerAbortDrag(
			event = {
				preventDefault: () => {
					return;
				},
			},
		) {
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
			if (this._state !== Ruler.STATES.MEASURING) return;
			if (tokenIds && !tokenIds.includes(this.draggedEntity.id)) return;
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
			if (destination) waypoints = waypoints.concat([destination]);
			return waypoints.slice(1).map((wp, i) => {
				const ray = new Ray(waypoints[i], wp);
				ray.isPrevious = Boolean(waypoints[i].isPrevious);
				return ray;
			});
		}

		dragRulerGetColorForDistance(distance) {
			if (!this.isDragRuler) return this.color;
			if (!this.draggedEntity.actor) {
				return this.color;
			}
			// Don't apply colors if the current user doesn't have at least observer permissions
			if (this.draggedEntity.actor.permission < 2) {
				// If this is a pc and alwaysShowSpeedForPCs is enabled we show the color anyway
				if (
					!(
						this.draggedEntity.actor.data.type === "character" &&
						game.settings.get(settingsKey, "alwaysShowSpeedForPCs")
					)
				)
					return this.color;
			}
			distance = Math.round(distance * 100) / 100;
			if (!this.dragRulerRanges)
				this.dragRulerRanges = getRangesFromSpeedProvider(this.draggedEntity);
			return (
				getColorForDistanceAndToken(distance, this.draggedEntity, this.dragRulerRanges) ??
				this.color
			);
		}

		dragRulerStart(options, measureImmediately = true) {
			const entity = this.draggedEntity;
			const isToken = entity instanceof Token;
			if (isToken && !currentSpeedProvider.usesRuler(entity)) return;
			const ruler = canvas.controls.ruler;
			ruler.clear();
			ruler._state = Ruler.STATES.STARTING;
			let entityCenter;
			if (
				isToken &&
				canvas.grid.isHex &&
				game.modules.get("hex-size-support")?.active &&
				CONFIG.hexSizeSupport.getAltSnappingFlag(entity)
			)
				entityCenter = getHexSizeSupportTokenGridCenter(entity);
			else entityCenter = entity.center;
			if (isToken && game.settings.get(settingsKey, "enableMovementHistory"))
				ruler.dragRulerAddWaypointHistory(getMovementHistory(entity));
			ruler.dragRulerAddWaypoint(entityCenter, {snap: false});
			const mousePosition = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(
				canvas.tokens,
			);
			const destination = {
				x: mousePosition.x + ruler.rulerOffset.x,
				y: mousePosition.y + ruler.rulerOffset.y,
			};
			if (measureImmediately) ruler.measure(destination, options);
		}

		dragRulerSendState() {
			game.user.broadcastActivity({
				ruler: this.toJSON(),
			});
		}
	}

	CONFIG.Canvas.rulerClass = DragRulerRuler;
}
