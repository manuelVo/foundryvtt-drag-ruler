import {measureDistances} from "./compatibility.js";
import {recalculate, updateCombatantDragRulerFlags} from "./socket.js";
import {getTokenShape, isClose, zip} from "./util.js";

function initTrackingFlag(combatant) {
	const initialFlag = {passedWaypoints: [], trackedRound: 0};
	let dragRulerFlag = combatant.flags.dragRuler;
	if (dragRulerFlag) {
		if (isNaN(dragRulerFlag.trackedRound)) {
			mergeObject(dragRulerFlag, initialFlag);
		}
	} else {
		combatant.flags.dragRuler = initialFlag;
	}
}

function getInitializedCombatant(token, combat) {
	const combatant = combat.getCombatantByToken(token.id);
	if (!combatant) return undefined;
	initTrackingFlag(combatant);
	return combatant;
}

export async function trackRays(tokens, tokenRays) {
	const combat = game.combat;
	if (!combat) return;
	if (!combat.started) return;
	if (!(tokens instanceof Array)) {
		tokens = [tokens];
		tokenRays = [tokenRays];
	}
	const updates = Array.from(zip(tokens, tokenRays))
		.map(([token, rays]) => calculateUpdate(combat, token, rays))
		.filter(Boolean);
	await updateCombatantDragRulerFlags(combat, updates);
}

function calculateUpdate(combat, token, rays) {
	const combatant = getInitializedCombatant(token, combat);
	if (!combatant) return;

	// Check if we have entered a new round. If so, remove the currently stored path
	if (combat.round > combatant.flags.dragRuler.trackedRound) {
		combatant.flags.dragRuler.passedWaypoints = [];
		combatant.flags.dragRuler.trackedRound = combat.round;
	}

	// Add the passed waypoints to the combatant
	const terrainRulerAvailable = game.modules.get("terrain-ruler")?.active;
	const dragRulerFlags = combatant.flags.dragRuler;
	const waypoints = dragRulerFlags.passedWaypoints;
	for (const ray of rays) {
		// Ignore rays that have the same start and end coordinates
		if (ray.A.x !== ray.B.x || ray.A.y !== ray.B.y) {
			if (terrainRulerAvailable) {
				measureDistances([{ray}], token, getTokenShape(token), {
					terrainRulerInitialState: waypoints[waypoints.length - 1]?.dragRulerFinalState,
					enableTerrainRuler: terrainRulerAvailable,
				});
				ray.A.dragRulerVisitedSpaces = ray.terrainRulerVisitedSpaces;
				ray.A.dragRulerFinalState = ray.terrainRulerFinalState;
			}
			waypoints.push(ray.A);
		}
	}
	return {_id: combatant.id, dragRulerFlags};
}

export function getMovementHistory(token) {
	const combat = game.combat;
	if (!combat) return [];
	const combatant = combat.getCombatantByToken(token.id);
	if (!combatant) return [];
	const dragRulerFlags = combatant.flags.dragRuler;
	if (!dragRulerFlags) return [];
	if (combat.round > dragRulerFlags.trackedRound) return [];
	return dragRulerFlags.passedWaypoints ?? [];
}

export async function removeLastHistoryEntryIfAt(token, x, y) {
	const history = getMovementHistory(token);
	if (history.length === 0) return;
	const entry = history[history.length - 1];
	if (!isClose(x + token.w / 2, entry.x, 0.1) || !isClose(y + token.h / 2, entry.y, 0.1)) {
		return;
	}
	history.pop();
	const combat = game.combat;
	const combatant = combat.getCombatantByToken(token.id);
	await updateCombatantDragRulerFlags(combat, [
		{_id: combatant.id, dragRulerFlags: combatant.flags.dragRuler},
	]);
}

export async function resetMovementHistory(combat, combatantId) {
	const combatant = combat.combatants.get(combatantId);
	const dragRulerFlags = combatant.flags.dragRuler;
	if (!dragRulerFlags) return;
	dragRulerFlags.passedWaypoints = null;
	dragRulerFlags.trackedRound = null;
	dragRulerFlags.rulerState = null;
	await updateCombatantDragRulerFlags(combat, [{_id: combatantId, dragRulerFlags}]);
	recalculate();
}
