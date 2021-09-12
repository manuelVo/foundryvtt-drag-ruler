import {currentSpeedProvider} from "./api.js";

let socket;

Hooks.once("socketlib.ready", () => {
  if(!game.modules.get('libruler')?.active) {
		socket = socketlib.registerModule("drag-ruler");
		socket.register("updateCombatantDragRulerFlags", _socketUpdateCombatantDragRulerFlags);
		socket.register("recalculate", _socketRecalculate);
	}
});

export function updateCombatantDragRulerFlags(combat, updates) {
	const combatId = combat.id;
	// TODO Check if canvas.tokens.get is still neccessary in future foundry versions
	return socket.executeAsGM(_socketUpdateCombatantDragRulerFlags, combatId, updates)
	             .then(() => currentSpeedProvider.onMovementHistoryUpdate(updates.map(update => canvas.tokens.get(combat.combatants.get(update._id).token.id))));
}

async function _socketUpdateCombatantDragRulerFlags(combatId, updates) {
	const user = game.users.get(this.socketdata.userId);
	const combat = game.combats.get(combatId);
	const requestedUpdates = updates.length;
	updates = updates.filter(update => {
		const actor = combat.combatants.get(update._id).actor;
		if (!actor)
			return false;
		return actor.testUserPermission(user, "OWNER");
	});
	if (updates.length !== requestedUpdates) {
		console.warn(`Some of the movement history updates requested by user '${game.users.get(this.socketdata.userId).name}' were not performed because the user lacks owner permissions for those tokens`);
	}
	updates = updates.map(update => {
		return {_id: update._id, flags: {dragRuler: update.dragRulerFlags}};
	});
	await combat.updateEmbeddedDocuments("Combatant", updates, {diff: false});
}

export function recalculate(tokens) {
	socket.executeForEveryone(_socketRecalculate, tokens ? tokens.map(token => token.id) : undefined);
}

function _socketRecalculate(tokenIds) {
	return canvas.controls.ruler.dragRulerRecalculate(tokenIds);
}
