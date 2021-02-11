
export function getDefaultSpeedAttribute() {
	switch (game.system.id) {
		case "dnd5e":
			return "actor.data.data.attributes.movement.walk"
		case "pf1":
			return "actor.data.data.attributes.speed.land.total"
		case "lancer":
			return "actor.data.data.mech.speed"
	}
	return ""
}

export function getDefaultDashMultiplier() {
	switch (game.system.id) {
		case "dnd5e":
		case "pf1":
		case "lancer":
			return 2
	}
	return 0
}
