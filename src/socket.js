let socket;

Hooks.once("socketlib.ready", () => {
	socket = socketlib.registerModule("drag-ruler");
	socket.register("updateCombatantDragRulerFlags", _socketUpdateCombatantDragRulerFlags);
});

export function updateCombatantDragRulerFlags(combat, combatant, flags) {
	const combatId = combat.id;
	const combatantId = combatant._id;
	return socket.executeAsGM(_socketUpdateCombatantDragRulerFlags, combatId, combatantId, flags);
}

async function _socketUpdateCombatantDragRulerFlags(combatId, combatantId, flags) {
	const combat = game.combats.get(combatId);
	await combat.updateEmbeddedEntity("Combatant", {_id: combatantId, flags: {dragRuler: flags}}, {diff: false});
}
