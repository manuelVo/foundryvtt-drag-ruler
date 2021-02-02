import {updateSpeedProvider} from "./api.js";
import {getDefaultDashMultiplier, getDefaultSpeedAttribute} from "./systems.js"

export const settingsKey = "drag-ruler";

export function registerSettings() {
	game.settings.register(settingsKey, "alwaysShowSpeedForPCs", {
		name: "drag-ruler.settings.alwaysShowSpeedForPCs.name",
		hint: "drag-ruler.settings.alwaysShowSpeedForPCs.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	})

	// This setting will be modified by the api if modules register to it
	game.settings.register(settingsKey, "speedProvider", {
		name: "drag-ruler.settings.speedProvider.name",
		hint: "drag-ruler.settings.speedProvider.hint",
		scope: "world",
		config: false,
		type: Object,
		choices: {
			"native": game.i18n.localize("drag-ruler.settings.speedProvider.choices.native")
		},
		default: "native",
		onChange: updateSpeedProvider,
	})

	game.settings.register(settingsKey, "speedAttribute", {
		name: "drag-ruler.settings.speedAttribute.name",
		hint: "drag-ruler.settings.speedAttribute.hint",
		scope: "world",
		config: true,
		type: String,
		default: getDefaultSpeedAttribute(),
	})

	game.settings.register(settingsKey, "dashMultiplier", {
		name: "drag-ruler.settings.dashMultiplier.name",
		hint: "drag-ruler.settings.dashMultiplier.hint",
		scope: "world",
		config: true,
		type: Number,
		default: getDefaultDashMultiplier(),
	})
}
