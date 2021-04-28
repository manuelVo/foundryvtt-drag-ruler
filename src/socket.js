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
	const combat = game.combats.get(combatId);
	updates = updates.map(update => {
		return {_id: update._id, flags: {dragRuler: update.dragRulerFlags}};
	});
	await combat.updateEmbeddedEntity("Combatant", updates, {diff: false});
}
