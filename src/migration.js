import {settingsKey} from "./settings.js"

const currentDataVersion = "1.3.0"

export function performMigrations() {
	if (!game.user.isGM)
		return

	let dataVersion = game.settings.get(settingsKey, "dataVersion")
	if (dataVersion === "fresh install") {
		game.settings.set(settingsKey, "dataVersion", currentDataVersion)
		return
	}
}
