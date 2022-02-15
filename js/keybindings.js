import {settingsKey} from "./settings.js";
import {getMeasurePosition, setSnapParameterOnOptions} from "./util.js";

export let disableSnap = false;
export let moveWithoutAnimation = false;
export let togglePathfinding = false;

export function registerKeybindings() {
	game.keybindings.register(settingsKey, "cancelDrag", {
		name: "drag-ruler.keybindings.cancelDrag",
		onDown: cancelDrag,
		uneditable: [{
			key: "Escape",
		}],
		precedence: -1,
	});

	game.keybindings.register(settingsKey, "createWaypoint", {
		name: "drag-ruler.keybindings.createWaypoint",
		onDown: handleCreateWaypoint,
		editable: [{
			key: "Space"
		}],
		precedence: -1,
	});

	game.keybindings.register(settingsKey, "deleteWaypoint", {
		name: "drag-ruler.keybindings.deleteWaypoint",
		onDown: handleDeleteWaypoint,
		precedence: -1,
	});

	game.keybindings.register(settingsKey, "disableSnap", {
		name: "drag-ruler.keybindings.disableSnap.name",
		hint: "drag-ruler.keybindings.disableSnap.hint",
		onDown: handleDisableSnap,
		onUp: handleDisableSnap,
		editable: [{
			key: "ShiftLeft",
		}],
		precedence: -1,
	});

	game.keybindings.register(settingsKey, "moveWithoutAnimation", {
		name: "drag-ruler.keybindings.moveWithoutAnimation.name",
		hint: "drag-ruler.keybindings.moveWithoutAnimation.hint",
		onDown: handleMoveWithoutAnimation,
		onUp: handleMoveWithoutAnimation,
		editable: [{
			key: "AltLeft",
		}],
		precedence: -1,
	});

	game.keybindings.register(settingsKey, "togglePathfinding", {
		name: "drag-ruler.keybindings.togglePathfinding.name",
		hint: "drag-ruler.keybindings.togglePathfinding.hint",
		onDown: handleTogglePathfinding,
		onUp: handleTogglePathfinding,
		precedence: -1,
		restricted: !game.settings.get(settingsKey, "allowPathfinding"),
	});
}

function handleDeleteWaypoint() {
	const ruler = canvas.controls.ruler;
	if (!ruler?.draggedEntity)
		return false;
	ruler.dragRulerDeleteWaypoint();
	return true;
}

function handleCreateWaypoint() {
	const ruler = canvas.controls.ruler;
	// .draggedEntity is used here because .isDragRuler only returns true once the ruler started measuring
	// Ruler can end up being undefined here if no canvas is active
	if (!ruler?.draggedEntity)
		return false;

	let options = {};
	setSnapParameterOnOptions(ruler, options);

	if (ruler._state === Ruler.STATES.INACTIVE) {
		ruler.dragRulerStart(options);
	}
	else {
		ruler.dragRulerAddWaypoint(getMeasurePosition(), options);
	}
	return true;
}

function cancelDrag() {
	const ruler = canvas.controls.ruler;
	if (!ruler?.draggedEntity)
		return false;
	ruler.dragRulerAbortDrag();
	return true;
}

function handleDisableSnap(event) {
	disableSnap = !event.up;

	const ruler = canvas.controls.ruler;
	if (!ruler?.isDragRuler)
		return false;
	if (ruler._state !== Ruler.STATES.MEASURING)
		return false;

	ruler.measure(getMeasurePosition(), {snap: !disableSnap});
	ruler.dragRulerSendState();
	return false;
}

function handleMoveWithoutAnimation(event) {
	moveWithoutAnimation = !event.up;
}

function handleTogglePathfinding(event) {
	togglePathfinding = !event.up;

	const ruler = canvas.controls.ruler;
	if (!ruler?.isDragRuler)
		return false;
	if (ruler._state !== Ruler.STATES.MEASURING)
		return false;

	ruler.measure(getMeasurePosition(), {snap: !disableSnap});
	ruler.dragRulerSendState();
	return false;
}
