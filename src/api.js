import {measureDistances} from "./compatibility.js";
import {getMovementHistory} from "./movement_tracking.js";
import {GenericSpeedProvider, SpeedProvider} from "./speed_provider.js"
import {settingsKey} from "./settings.js"
import {getTokenShape} from "./util.js";

export const availableSpeedProviders = {}
export let currentSpeedProvider = undefined

function register(module, type, speedProvider) {
	const id = `${type}.${module.id}`
	let providerInstance
	if (speedProvider.prototype instanceof SpeedProvider) {
		providerInstance = new speedProvider(id)
	}
	else {
		console.warn(`Drag Ruler | The ${type} '${module.id}' uses the old, deprecated version of the Drag Ruler API. ` +
		             "That old API will be removed in a future Drag Ruler version. " +
		             `Please update the ${type} ${module.id} to stay compatible with future Drag Ruler versions.`);
		speedProvider.id = id
		speedProvider.usesRuler = () => true
		providerInstance = speedProvider
	}
	setupProvider(providerInstance)
}

function setupProvider(speedProvider) {
	if (speedProvider instanceof SpeedProvider) {
		const unreachableColor = {id: "unreachable", default: speedProvider.defaultUnreachableColor, name: "drag-ruler.settings.speedProviderSettings.color.unreachable.name"}
		for (const color of speedProvider.colors.concat([unreachableColor])) {
			game.settings.register(settingsKey, `speedProviders.${speedProvider.id}.color.${color.id}`, {
				config: false,
				scope: "client",
				type: Number,
				default: color.default,
			})
		}
		for (const setting of speedProvider.settings) {
			setting.config = false
			game.settings.register(settingsKey, `speedProviders.${speedProvider.id}.setting.${setting.id}`, setting)
		}
	}

	availableSpeedProviders[speedProvider.id] = speedProvider
	game.settings.settings.get("drag-ruler.speedProvider").default = getDefaultSpeedProvider()
	updateSpeedProvider()
}

export function getDefaultSpeedProvider() {
	const providerIds = Object.keys(availableSpeedProviders)
	// Game systems take the highest precedence for the being the default
	const gameSystem = providerIds.find(key => key.startsWith("system."))
	if (gameSystem)
		return gameSystem

	// If no game system is registered modules are next up.
	// For lack of a method to select the best module we're just falling back to taking the next best module
	// settingKeys should always be sorted the same way so this should achive a stable default
	const module = providerIds.find(key => key.startsWith("module."))
	if (module)
		return module

	// If neither a game system or a module is found fall back to the native implementation
	return providerIds[0]
}

export function updateSpeedProvider() {
	// If the configured provider is registered use that one. If not use the default provider
	const configuredProvider = game.settings.get("drag-ruler", "speedProvider")
	currentSpeedProvider = availableSpeedProviders[configuredProvider] ?? availableSpeedProviders[game.settings.settings.get("drag-ruler.speedProvider").default]
}

export function initApi() {
	const genericSpeedProviderInstance = new GenericSpeedProvider("native")
	setupProvider(genericSpeedProviderInstance)
}

export function getRangesFromSpeedProvider(token) {
	try {
		if (currentSpeedProvider instanceof Function)
			return currentSpeedProvider(token, 0x00FF00)
		const ranges = currentSpeedProvider.getRanges(token)
		for (const range of ranges) {
			range.color = game.settings.get(settingsKey, `speedProviders.${currentSpeedProvider.id}.color.${range.color}`)
		}
		return ranges
	}
	catch (e) {
		console.error(e)
		return []
	}
}

export function getUnreachableColorFromSpeedProvider() {
	if (currentSpeedProvider instanceof Function)
		return 0xFF0000
	try {
		return game.settings.get(settingsKey, `speedProviders.${currentSpeedProvider.id}.color.unreachable`)
	}
	catch (e) {
		console.error(e)
		return 0xFF0000
	}
}

export function getCostFromSpeedProvider(token, area, options) {
	try {
		if (currentSpeedProvider instanceof Function) {
			return SpeedProvider.prototype.getCostForStep.call(undefined, token, area, options);
		}
		return currentSpeedProvider.getCostForStep(token, area, options);
	}
	catch (e) {
		console.error(e);
		return 1;
	}
}

export function getColorForDistanceAndToken(distance, token, ranges=null) {
	if (!ranges) {
		ranges = getRangesFromSpeedProvider(token);
	}
	if (ranges.length === 0)
		return this.color;
	const currentRange = ranges.reduce((minRange, currentRange) => {
		if (distance <= currentRange.range && currentRange.range < minRange.range)
			return currentRange;
		return minRange;
	}, {range: Infinity, color: getUnreachableColorFromSpeedProvider()});
	return currentRange.color;
}

export function getMovedDistanceFromToken(token) {
	const history = getMovementHistory(token);
	const segments = Ruler.dragRulerGetRaysFromWaypoints(history, {x: token.x, y: token.y}).map(ray => {return {ray}});
	const shape = getTokenShape(token);
	const distances = measureDistances(segments, token, shape);
	// Sum up the distances
	return distances.reduce((acc, val) => acc + val, 0);
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
