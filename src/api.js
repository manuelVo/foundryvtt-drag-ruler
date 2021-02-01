export const availableSpeedProviders = {}
export let currentSpeedProvider = undefined

function register(module, type, speedProvider) {
	const providerSetting = game.settings.settings.get("drag-ruler.speedProvider")

	// Add the registered module to the settings entry
	providerSetting.config = true
	const moduleName = module.data.title
	const typeTitle = game.i18n.localize(`drag-ruler.settings.speedProvider.choices.${type}`)
	providerSetting.choices[`${type}.${module.id}`] = `${typeTitle} ${moduleName}`
	availableSpeedProviders[`${type}.${module.id}`] = speedProvider
	providerSetting.default = getDefaultSpeedProvider()

	updateSpeedProvider()
}

function getDefaultSpeedProvider() {
	const providerSetting = game.settings.settings.get("drag-ruler.speedProvider")
	const settingKeys = Object.keys(providerSetting.choices)
	// Game systems take the highest precedence for the being the default
	const gameSystem = settingKeys.find(key => key.startsWith("system."))
	if (gameSystem)
		return gameSystem

	// If no game system is registered modules are next up.
	// For lack of a method to select the best module we're just falling back to taking the next best module
	// settingKeys should always be sorted the same way so this should achive a stable default
	const module = settingKeys.find(key => key.startsWith("module."))
	if (module)
		return module

	// If neither a game system or a module is found fall back to the native implementation
	return settingKeys[0]
}

export function updateSpeedProvider() {
	// If the configured provider is registered use that one. If not use the default provider
	const configuredProvider = game.settings.get("drag-ruler", "speedProvider")
	currentSpeedProvider = availableSpeedProviders[configuredProvider] ?? availableSpeedProviders[game.settings.settings.get("drag-ruler.speedProvider").default]
}

export function setCurrentSpeedProvider(newSpeedProvider) {
	currentSpeedProvider = newSpeedProvider
}

export function registerModule(moduleId, speedProvider) {
	// Check if a module with the given id exists and is currently enabled
	const module = game.modules.get(moduleId)
	// If it doesn't the calling module did something wrong. Log a warning and ignore this module
	if (!module) {
		console.warn(
			`Drag Ruler | A module tried to register with the id "${moduleId}". However no active module with this id was found.` +
			"This api registration call was ignored. " +
			"If you are the author of that module please check that the id passed to `registerModule` matches the id in your manifest exactly." +
			"If this call was made form a game system instead of a module please use `registerSystem` instead.")
		return
	}
	// Using Drag Ruler's id is not allowed
	if (moduleId === "drag-ruler") {
		console.warn(
			`Drag Ruler | A module tried to register with the id "${moduleId}", which is not allowed. This api registration call was ignored. ` +
			"If you're the author of the module please use the id of your own module as it's specified in your manifest to register to this api. " +
			"If this call was made form a game system instead of a module please use `registerSystem` instead."
		)
		return
	}

	register(module, "module", speedProvider)
}

export function registerSystem(systemId, speedProvider) {
	const system = game.system
	// If the current system id doesn't match the provided id something went wrong. Log a warning and ignore this module
	if (system.id != systemId) {
		console.warn(
			`Drag Ruler | A system tried to register with the id "${systemId}". However the active system has a different id.` +
			"This api registration call was ignored. " +
			"If you are the author of that system please check that the id passed to `registerSystem` matches the id in your manifest exactly." +
			"If this call was made form a module instead of a game system please use `registerModule` instead.")
		return
	}

	register(system, "system", speedProvider)
}
