import {measure} from "./foundry_imports.js"
import {settingsKey} from "./settings.js";
import {getSnapPointForToken} from "./util.js";

export class DragRulerRuler extends Ruler {
	// Functions below are overridden versions of functions in Ruler
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
		if (this.draggedToken)
			json["draggedToken"] = this.draggedToken.data._id;
		return json;
	}

	update(data) {
		// Don't show a GMs drag ruler to non GM players
		if (data.draggedToken && this.user.isGM && !game.user.isGM && !game.settings.get(settingsKey, "showGMRulerToPlayers"))
			return;

		if (data.draggedToken) {
			this.draggedToken = canvas.tokens.get(data.draggedToken);
		}
		super.update(data);
	}

	measure(destination, options={}) {
		if (this.isDragRuler) {
			return measure.call(this, destination, options);
		}
		else {
			return super.measure(mestination, options);
		}
	}

	_endMeasurement() {
		super._endMeasurement();
		this.draggedToken = null;
	}

	// The functions below aren't present in the orignal Ruler class and are added by Drag Ruler
	dragRulerAddWaypoint(point, snap=true) {
		if (snap)
			point = getSnapPointForToken(point.x, point.y, this.draggedToken);
		this.waypoints.push(new PIXI.Point(point.x, point.y));
		this.labels.addChild(new PreciseText("", CONFIG.canvasTextStyle));
	}

	dragRulerDeleteWaypoint() {
		if (this.waypoints.length > 1) {
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
			token._onDragLeftCancel({preventDefault: () => {return}});
		}
	}
}
