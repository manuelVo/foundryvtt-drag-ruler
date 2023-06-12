export function getDefaultSpeedAttribute() {
	switch (game.system.id) {
		case "CoC7":
			return "actor.system.attribs.mov.value";
		case "dcc":
			return "actor.system.attributes.speed.value";
		case "dnd4e":
			return "actor.system.movement.walk.value";
		case "dnd5e":
			return "actor.system.attributes.movement.walk";
		case "lancer":
			return "actor.system.derived.speed";
		case "pf1":
		case "D35E":
			return "actor.system.attributes.speed.land.total";
		case "sfrpg":
			return "actor.system.attributes.speed.value";
		case "shadowrun5e":
			return "actor.system.movement.walk.value";
		case "swade":
			return "actor.system.stats.speed.adjusted";
		case "ds4":
			return "actor.system.combatValues.movement.total";
		case "splittermond":
			return "actor.derivedValues.speed.value";
		case "wfrp4e":
			return "actor.system.details.move.walk";
		case "crucible":
	}
	return "";
}

export function getDefaultDashMultiplier() {
	switch (game.system.id) {
		case "swade":
			return 0;
		case "dcc":
		case "dnd4e":
		case "dnd5e":
		case "lancer":
		case "pf1":
		case "D35E":
		case "sfrpg":
		case "shadowrun5e":
		case "ds4":
			return 2;
		case "CoC7":
			return 5;
		case "splittermond":
			return 3;
		case "wfrp4e":
			return 2;
		case "crucible":	
	}
	return 0;
}
