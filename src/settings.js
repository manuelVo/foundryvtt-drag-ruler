import {
	availableSpeedProviders,
	currentSpeedProvider,
	getDefaultSpeedProvider,
	updateSpeedProvider,
} from "./api.js";
import {SpeedProvider} from "./speed_provider.js";
import {early_isGM} from "./util.js";

export const settingsKey = "drag-ruler";

export const RightClickAction = Object.freeze({
	CREATE_WAYPOINT: 0,
	DELETE_WAYPOINT: 1,
	ABORT_DRAG: 2,
});

function delayedReload() {
	window.setTimeout(() => location.reload(), 500);
}

export function registerSettings() {
	game.settings.register(settingsKey, "dataVersion", {
		scope: "world",
		config: false,
		type: String,
		default: "fresh install",
	});

	game.settings.register(settingsKey, "clientDataVersion", {
		scope: "client",
		config: false,
		type: String,
		default: "fresh install",
	});

	game.settings.register(settingsKey, "rightClickAction", {
		name: "drag-ruler.settings.rightClickAction.name",
		hint: "drag-ruler.settings.rightClickAction.hint",
		config: true,
		type: Number,
		default: RightClickAction.DELETE_WAYPOINT,
		choices: {
			0: "drag-ruler.settings.rightClickAction.choices.create",
			1: "drag-ruler.settings.rightClickAction.choices.delete",
			2: "drag-ruler.settings.rightClickAction.choices.cancel",
		},
	});

	game.settings.register(settingsKey, "autoStartMeasurement", {
		name: "drag-ruler.settings.autoStartMeasurement.name",
		hint: "drag-ruler.settings.autoStartMeasurement.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(settingsKey, "useGridlessRaster", {
		name: "drag-ruler.settings.useGridlessRaster.name",
		hint: "drag-ruler.settings.useGridlessRaster.hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(settingsKey, "alwaysShowSpeedForPCs", {
		name: "drag-ruler.settings.alwaysShowSpeedForPCs.name",
		hint: "drag-ruler.settings.alwaysShowSpeedForPCs.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(settingsKey, "showGMRulerToPlayers", {
		name: "drag-ruler.settings.showGMRulerToPlayers.name",
		hint: "drag-ruler.settings.showGMRulerToPlayers.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	game.settings.register(settingsKey, "enableMovementHistory", {
		name: "drag-ruler.settings.enableMovementHistory.name",
		hint: "drag-ruler.settings.enableMovementHistory.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	if (game.modules.get("routinglib")?.active) {
		game.settings.register(settingsKey, "allowPathfinding", {
			name: "drag-ruler.settings.allowPathfinding.name",
			hint: "drag-ruler.settings.allowPathfinding.hint",
			scope: "world",
			config: true,
			type: Boolean,
			default: false,
			onChange: delayedReload,
		});

		game.settings.register(settingsKey, "autoPathfinding", {
			name: "drag-ruler.settings.autoPathfinding.name",
			hint: "drag-ruler.settings.autoPathfinding.hint",
			scope: "client",
			config: early_isGM() || game.settings.get(settingsKey, "allowPathfinding"),
			type: Boolean,
			default: false,
		});
	}

	game.settings.register(settingsKey, "lastTerrainRulerHintTime", {
		config: false,
		type: Number,
		default: 0,
	});

	game.settings.register(settingsKey, "neverShowTerrainRulerHint", {
		config: false,
		type: Boolean,
		default: false,
	});

	// This setting will be modified by the api if modules register to it
	game.settings.register(settingsKey, "speedProvider", {
		scope: "world",
		config: false,
		type: String,
		default: getDefaultSpeedProvider(),
		onChange: updateSpeedProvider,
	});

	game.settings.registerMenu(settingsKey, "speedProviderSettings", {
		name: "drag-ruler.settings.speedProviderSettings.name",
		hint: "drag-ruler.settings.speedProviderSettings.hint",
		label: "drag-ruler.settings.speedProviderSettings.button",
		icon: "fas fa-tachometer-alt",
		type: SpeedProviderSettings,
		restricted: false,
	});

  game.settings.register(settingsKey, "rulerScale", {
    name: "Ruler Scale",
    scope: "client",
    config: true,
    default: 100,
    type: Number,
  });
}

class SpeedProviderSettings extends FormApplication {
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: "drag-ruler-speed-provider-settings",
			title: game.i18n.localize("drag-ruler.settings.speedProviderSettings.windowTitle"),
			template: "modules/drag-ruler/templates/speed_provider_settings.html",
			width: 600,
		});
	}

	getData(options = {}) {
		const data = {};
		data.isGM = game.user.isGM;
		const selectedProvider = currentSpeedProvider.id;

		// Insert all speed providers into the template data
		data.providers = Object.values(availableSpeedProviders).map(speedProvider => {
			const provider = {};
			provider.id = speedProvider.id;
			provider.hasSettings = speedProvider instanceof SpeedProvider;
			if (provider.hasSettings) provider.settings = enumerateProviderSettings(speedProvider);
			let dotPosition = provider.id.indexOf(".");
			if (dotPosition === -1) dotPosition = provider.id.length;
			const type = provider.id.substring(0, dotPosition);
			const id = provider.id.substring(dotPosition + 1);
			if (type === "native") {
				provider.selectTitle = game.i18n.localize(
					"drag-ruler.settings.speedProviderSettings.speedProvider.choices.native",
				);
			} else {
				let name;
				if (type === "module") {
					name = game.modules.get(id).title;
				} else {
					name = game.system.title;
				}
				provider.selectTitle = game.i18n.format(
					`drag-ruler.settings.speedProviderSettings.speedProvider.choices.${type}`,
					{name},
				);
			}
			provider.isSelected = provider.id === selectedProvider;
			return provider;
		});
		data.selectedProviderName = data.providers.find(provider => provider.isSelected).selectTitle;

		data.providerSelection = {
			id: "speedProvider",
			name: game.i18n.localize("drag-ruler.settings.speedProviderSettings.speedProvider.name"),
			hint: game.i18n.localize("drag-ruler.settings.speedProviderSettings.speedProvider.hint"),
			type: String,
			choices: data.providers.reduce((choices, provider) => {
				choices[provider.id] = provider.selectTitle;
				return choices;
			}, {}),
			value: selectedProvider,
			isCheckbox: false,
			isSelect: true,
			isRange: false,
		};
		return data;
	}

	async _updateObject(event, formData) {
		const selectedSpeedProvider = game.user.isGM
			? formData.speedProvider
			: game.settings.get(settingsKey, "speedProvider");
		for (let [key, value] of Object.entries(formData)) {
			// Check if this is color, convert the value to an integer
			const splitKey = key.split(".", 3);
			if (splitKey[0] !== "native") splitKey.shift();
			if (splitKey.length >= 2 && splitKey[1] == "color") {
				value = parseInt(value.substring(1), 16);
			}

			// Don't change settings for speed providers that aren't currently active
			if (key !== "speedProvider" && !key.startsWith(selectedSpeedProvider)) continue;

			// Get the key for the current setting
			let setting;
			if (key === "speedProvider") setting = "speedProvider";
			else setting = `speedProviders.${key}`;

			// Get the old setting value
			const oldValue = game.settings.get(settingsKey, setting);

			// Only update the setting if it has been changed (this leaves the default in place if it hasn't been touched)
			if (value !== oldValue) game.settings.set(settingsKey, setting, value);
		}

		// Activate the configured speed provider
		updateSpeedProvider();
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find("select[name=speedProvider]").change(this.onSpeedProviderChange.bind(this));
	}

	onSpeedProviderChange(event) {
		// Hide all module settings
		document
			.querySelectorAll(".drag-ruler-provider-settings")
			.forEach(element => (element.style.display = "none"));
		// Show the settings block for the currently selected module
		document.getElementById(`drag-ruler.provider.${event.currentTarget.value}`).style.display = "";

		// Recalculate window height
		this.element[0].style.height = null;
		this.position.height = undefined;
	}
}

function toDomHex(value) {
	const hex = value.toString(16);
	return "#" + "0".repeat(Math.max(0, 6 - hex.length)) + hex;
}

function enumerateProviderSettings(provider) {
	const colorSettings = [];
	const unreachableColor = {
		id: "unreachable",
		name: "drag-ruler.settings.speedProviderSettings.color.unreachable.name",
	};

	// Resolve settings for the colors
	for (const color of provider.colors.concat([unreachableColor])) {
		// Localize the name, if avaliable. If no name is available use the id as name
		const colorName = color.name ? game.i18n.localize(color.name) : color.id;
		let hint;
		if (color === unreachableColor)
			hint = game.i18n.localize("drag-ruler.settings.speedProviderSettings.color.unreachable.hint");
		else
			hint = game.i18n.format("drag-ruler.settings.speedProviderSettings.color.hint", {colorName});
		colorSettings.push({
			id: `${provider.id}.color.${color.id}`,
			name: game.i18n.format("drag-ruler.settings.speedProviderSettings.color.name", {colorName}),
			hint: hint,
			type: Number,
			value: toDomHex(
				game.settings.get(settingsKey, `speedProviders.${provider.id}.color.${color.id}`),
			),
			isCheckbox: false,
			isSelect: false,
			isRange: false,
			isColor: true,
		});
	}

	// Prepare regular settings
	const settings = [];
	for (const setting of provider.settings) {
		try {
			if (setting.scope === "world" && !game.user.isGM) continue;
			const s = duplicate(setting);
			s.id = `${provider.id}.setting.${s.id}`;
			s.name = game.i18n.localize(s.name);
			s.hint = game.i18n.localize(s.hint);
			s.value = provider.getSetting(setting.id);
			s.type = setting.type instanceof Function ? setting.type.name : "String";
			s.isCheckbox = setting.type === Boolean;
			s.isSelect = s.choices !== undefined;
			s.isRange = setting.type === Number && s.range;
			s.isColor = false;
			settings.push(s);
		} catch (e) {
			console.warn(
				`Drag Ruler | The following error occured while rendering setting "${setting.id}" of module/system "${this.id}. It won't be displayed.`,
			);
			console.error(e);
		}
	}

	return settings.concat(colorSettings);
}
