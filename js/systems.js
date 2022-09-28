export function getDefaultSpeedAttribute() {
	switch (game.system.id) {
		case "CoC7":
			return "actor.data.data.attribs.mov.value";
		case "dcc":
			return "actor.data.data.attributes.speed.value";
		case "dnd4e":
			return "actor.data.data.movement.walk.value";
		case "dnd5e":
			return "actor.data.data.attributes.movement.walk";
		case "lancer":
			return "actor.data.data.derived.speed";
		case "pf1":
		case "D35E":
			return "actor.data.data.attributes.speed.land.total";
		case "sfrpg":
			return "actor.data.data.attributes.speed.value";
		case "shadowrun5e":
			return "actor.data.data.movement.walk.value";
		case "swade":
			return "actor.data.data.stats.speed.adjusted";
		case "ds4":
			return "actor.data.data.combatValues.movement.total";
		case "splittermond":
			return "actor.derivedValues.speed.value";
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
	}
	return 0;
}
