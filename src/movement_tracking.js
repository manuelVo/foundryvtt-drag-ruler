import {measureDistances} from "./compatibility.js";
import {updateCombatantDragRulerFlags} from "./socket.js";
import {getTokenShape, zip} from "./util.js";

function initTrackingFlag(combatant) {
	const initialFlag = {passedWaypoints: [], trackedRound: 0};
	let dragRulerFlag = combatant.flags?.dragRuler;
	if (dragRulerFlag) {
		if (isNaN(dragRulerFlag.trackedRound)) {
			mergeObject(dragRulerFlag, initialFlag);
		}
	}
	else {
		combatant.flags.dragRuler = initialFlag;
	}
}

function getInitializedCombatant(token, combat) {
	const combatant = combat.getCombatantByToken(token.data._id);
	if (!combatant)
		return undefined;
	initTrackingFlag(combatant);
	return combatant;
}

export async function trackRays(tokens, tokenRays) {
	const combat = game.combat;
	if (!combat)
		return;
	if (!combat.started)
		return;
	if (!(tokens instanceof Array)) {
		tokens = [tokens];
		tokenRays = [tokenRays];
	}
	const updates = Array.from(zip(tokens, tokenRays)).map(([token, rays]) => calculateUpdate(combat, token, rays)).filter(Boolean);
	await updateCombatantDragRulerFlags(combat, updates);
}

function calculateUpdate(combat, token, rays) {
	const combatant = getInitializedCombatant(token, combat);
	if (!combatant)
		return;

	// Check if we have entered a new round. If so, remove the currently stored path
	if (combat.data.round > combatant.flags.dragRuler.trackedRound) {
		combatant.flags.dragRuler.passedWaypoints = [];
		combatant.flags.dragRuler.trackedRound = combat.data.round;
	}

	// Add the passed waypoints to the combatant
	const terrainRulerAvailable = game.modules.get("terrain-ruler")?.active && canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS;
	const dragRulerFlags = combatant.flags.dragRuler;
	const waypoints = dragRulerFlags.passedWaypoints;
	for (const ray of rays) {
		// Ignore rays that have the same start and end coordinates
		if (ray.A.x !== ray.B.x || ray.A.y !== ray.B.y) {
			if (terrainRulerAvailable) {
				measureDistances([{ray}], token, getTokenShape(token), true, {terrainRulerInitialState: dragRulerFlags.rulerState});
				ray.A.dragRulerVisitedSpaces = ray.terrainRulerVisitedSpaces;
				dragRulerFlags.rulerState = ray.terrainRulerFinalState;
			}
			waypoints.push(ray.A);
		}
	}
	return {_id: combatant._id, dragRulerFlags};
}

export function getMovementHistory(token) {
	const combat = game.combat;
	if (!combat)
		return [];
	const combatant = combat.getCombatantByToken(token.data._id);
	if (!combatant)
		return [];
	const dragRulerFlags = combatant.flags.dragRuler;
	if (!dragRulerFlags)
		return [];
	if (combat.data.round > dragRulerFlags.trackedRound)
		return [];
	return dragRulerFlags.passedWaypoints ?? [];
}

export async function resetMovementHistory(combat, combatantId) {
	const combatant = combat.getCombatant(combatantId);
	const dragRulerFlags = combatant.flags.dragRuler;
	if (!dragRulerFlags)
		return;
	dragRulerFlags.passedWaypoints = undefined;
	dragRulerFlags.trackedRound = undefined;
	dragRulerFlags.rulerState = undefined;
	await updateCombatantDragRulerFlags(combat, [{_id: combatantId, dragRulerFlags}]);
}
