let socket;

Hooks.once("socketlib.ready", () => {
	socket = socketlib.registerModule("drag-ruler");
	socket.register("updateCombatantDragRulerFlags", _socketUpdateCombatantDragRulerFlags);
});

export function updateCombatantDragRulerFlags(combat, updates) {
	const combatId = combat.id;
	return socket.executeAsGM(_socketUpdateCombatantDragRulerFlags, combatId, updates);
}

async function _socketUpdateCombatantDragRulerFlags(combatId, updates) {
	const user = game.users.get(this.socketdata.userId);
	const combat = game.combats.get(combatId);
	const requestedUpdates = updates.length;
	updates = updates.filter(update => {
		const actor = combat.getCombatant(update._id).actor;
		if (!actor)
			return false;
		return actor.hasPerm(user, "OWNER");
	});
	if (updates.length !== requestedUpdates) {
		console.warn(`Some of the movement history updates requested by user '${game.users.get(this.socketdata.userId).name}' were not performed because the user lacks owner permissions for those tokens`);
	}
	updates = updates.map(update => {
		return {_id: update._id, flags: {dragRuler: update.dragRulerFlags}};
	});
	await combat.updateEmbeddedEntity("Combatant", updates, {diff: false});
}
