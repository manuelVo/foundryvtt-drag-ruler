import {settingsKey} from "./settings.js"

const currentDataVersion = "1.3.0"

export function performMigrations() {
	if (!game.user.isGM)
		return

	let dataVersion = game.settings.get(settingsKey, "dataVersion")
	if (dataVersion === "fresh install") {
		// Migration from unnamed version. TODO Remove this in a future version
		let speedAttribute = game.settings.storage.get("world").get(`${settingsKey}.speedAttribute`)
		if (speedAttribute)
			speedAttribute = speedAttribute.slice(1, speedAttribute.length - 1)
		const speedAttributeDefault = game.settings.get(settingsKey, "speedProviders.native.setting.speedAttribute")
		if (speedAttribute !== speedAttributeDefault)
			game.settings.set(settingsKey, "speedProviders.native.setting.speedAttribute", speedAttribute)

		let dashMultiplier = game.settings.storage.get("world").get(`${settingsKey}.dashMultiplier`)
		const dashMultiplierDefault = game.settings.get(settingsKey, "speedProviders.native.setting.dashMultiplier")
		if (dashMultiplier !== dashMultiplierDefault)
			game.settings.set(settingsKey, "speedProviders.native.setting.dashMultiplier", dashMultiplier)
		// End of unnamed version migration code
		game.settings.set(settingsKey, "dataVersion", currentDataVersion)
		return
	}
}
