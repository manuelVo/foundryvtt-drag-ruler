import {settingsKey} from "./settings.js"
import {getDefaultDashMultiplier, getDefaultSpeedAttribute} from "./systems.js"

/**
 * Base class for all speed providers.
 * If you want to offer a speed provider in your system/module you must derive this class.
 * Each speed provider must at least implement
 */
export class SpeedProvider {
	/**
	 * Returns an array of colors used by this speed provider. Each color corresponds to one speed that a token may have.
	 * Each color must be an object with the following properties:
	 * - id: A value that identfies the color. Must be unique for each color returned.
	 * - default: The color that is used to highlight that speed by default.
	 * - name: A user readable name for the speed represented by the color. This name is used in the color configuration dialog. Drag Ruler will attempt to localize this string using `game.i18n`
	 *
	 * Of these properties, id and defaultColor are required. name is optional, but it's recommended to set it
	 *
	 * Implementing this method is required for all speed providers
	 */
	get colors() {
		throw new Error("A SpeedProvider must implement the colors function")
	}

	/**
	 * Returns an array of speeds that the token passed in the arguments this token can reach.
	 * Each range is an object that with the following properties:
	 * - range: A number indicating the distance that the token can travel with this speed
	 * - color: The id (as defined in the `colors` getter) of the color that should be used to represent this range
	 *
	 * Implementing this method is required for all speed providers
	 */
	getRanges(token) {
		throw new Error("A SpeedProvider must implement the getRanges function")
	}

	/**
	 * Returns an array of configuration options for this module. The settings will be shown in the Speed Provider Settings of Drag Ruler.
	 * Each configuration option is an object that has the same attributes as a native foundry setting passed to `game.settings.register`,
	 * except for these exceptions:
	 * - id: A string that identifies the setting. Must be unique for each setting returned. This id will be used to fetch the setting.
	 * - config: This property is not supported by Drag Ruler module settings. Use foundries native settings instead if you need settings that don't show up in the configuration dialog.
	 *
	 * Implementing this method is optional and only needs to be done if you want to provide custom provider settings
	 */
	get settings() {
		return []
	}

	/**
	 * Returns the default color for ranges that a token cannot reach.
	 *
	 * Implementing this method is optional and only needs to be done if you want to provide a custom default for that color.
	 */
	get defaultUnreachableColor() {
		return 0xFF0000
	}

	/**
	 * Returns the cost for a token to step into the specificed area.
	 * The area indicates the whole area that the token will occupy (for tokens larger than 1x1) the array will more than one entry.
	 * The return value should be an integer indicating a multiplicator by that the cost of that step should be increased.
	 * (1 is regular cost, 2 costs double, 3 costs triple, ...)
	 *
	 * Parameters:
	 * - options: An object used to configure Enhanced Terrain Layer's cost calculation. Ex: If options.ignoreGrid is set to true, then Euclidean measurement can be forced on a gridded map.
	 *
	 * This function is only called if the Enhanced Terrain Layer and Terrain Ruler modules are enabled.
	 *
	 * Implementing this method is optional and only needs to be done if you want to provide a custom cost function (for example to allow tokens to ignore difficult terrain)
	 */
	getCostForStep(token, area, options={}) {
		// Lookup the cost for each square occupied by the token
		options.token = token;
		const costs = area.map(space => terrainRuler.getCost(space.x, space.y, options));
		// Return the maximum of the costs
		return costs.reduce((max, current) => Math.max(max, current))
	}

	/**
	 * Returns a boolean indicating whether this token will use a Ruler or not.
	 * If this is returns `false` for a token Drag Ruler will be disabled for that token. Dragging a token for which this function
	 * returns false will behave as if Drag Ruler wasn't installed.
	 * If usesRuler returns `false` it's guranteed that the `getRanges` function won't be called for that token.
	 *
	 * Implementing this method is optional and only needs to be done if you want to disable Drag Ruler for some tokens.
	 */
	usesRuler(token) {
		return true
	}

	/**
	 * This hook is being called after Drag Ruler has updated the movement history for one or more tokens.
	 * It'll receive an array of tokens that have been updated.
	 * If your speed provider is storing any additional values that are relevant for the movement history, this function should
	 * await until those updates have completed inside foundry.
	 */
	async onMovementHistoryUpdate(tokens) {}

	/**
	 * Returns the value that is currently set for the setting registered with the provided settingId.
	 *
	 * This function shouldn't be overridden by speed provider implementations. It can be called to fetch speed provider specific settings.
	 */
	getSetting(settingId) {
		try {
			return game.settings.get(settingsKey, `speedProviders.${this.id}.setting.${settingId}`)
		}
		catch (e) {
			if (this.settings.some(setting => setting.id === settingId)) {
				throw e
			}
			throw new Error(`Drag Ruler | "${settingId}" is not a registered setting for "${this.id}". If you're the module/system developer, please add it to the return values of your Speed Providers "get settings()" function.`)
		}
	}

	/**
	 * Constructs a new instance of he speed provider
	 *
	 * This function should neither be called or overridden by speed provider implementations
	 */
	constructor(id) {
		this.id = id
	}
}


export class GenericSpeedProvider extends SpeedProvider {
	get colors() {
		return [
			{id: "walk", default: 0x00FF00, name: "drag-ruler.genericSpeedProvider.speeds.walk"},
			{id: "dash", default: 0xFFFF00, name: "drag-ruler.genericSpeedProvider.speeds.dash"}
		]
	}

	getRanges(token) {
		const speedAttribute = this.getSetting("speedAttribute")
		if (!speedAttribute)
			return []
		const tokenSpeed = parseFloat(getProperty(token.document, speedAttribute));
		if (tokenSpeed === undefined) {
			console.warn(`Drag Ruler (Generic Speed Provider) | The configured token speed attribute "${speedAttribute}" didn't return a speed value. To use colors based on drag distance set the setting to the correct value (or clear the box to disable this feature).`)
			return []
		}
		const dashMultiplier = this.getSetting("dashMultiplier")
		if (!dashMultiplier)
			return [{range: tokenSpeed, color: "walk"}]
		return [{range: tokenSpeed, color: "walk"}, {range: tokenSpeed * dashMultiplier, color: "dash"}]
	}

	get settings() {
		return [
			{
				id: "speedAttribute",
				name: "drag-ruler.genericSpeedProvider.settings.speedAttribute.name",
				hint: "drag-ruler.genericSpeedProvider.settings.speedAttribute.hint",
				scope: "world",
				config: true,
				type: String,
				default: getDefaultSpeedAttribute(),
			},
			{
				id: "dashMultiplier",
				name: "drag-ruler.genericSpeedProvider.settings.dashMultiplier.name",
				hint: "drag-ruler.genericSpeedProvider.settings.dashMultiplier.hint",
				scope: "world",
				config: true,
				type: Number,
				default: getDefaultDashMultiplier(),
			}
		]
	}
}
