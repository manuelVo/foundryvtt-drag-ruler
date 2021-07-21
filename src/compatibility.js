import {getCostFromSpeedProvider} from "./api.js";
import {getColorForDistance} from "./main.js"
import {settingsKey} from "./settings.js";
import {getAreaFromPositionAndShape, highlightTokenShape} from "./util.js";

export function getHexSizeSupportTokenGridCenter(token) {
	const tokenCenterOffset = CONFIG.hexSizeSupport.getCenterOffset(token)
	return {x: token.x + tokenCenterOffset.x, y: token.y + tokenCenterOffset.y}
}

export function highlightMeasurementTerrainRuler(ray, startDistance, tokenShape=[{x: 0, y: 0}], alpha=1) {
	for (const space of ray.terrainRulerVisitedSpaces.reverse()) {
		const color = getColorForDistance.call(this, startDistance, space.distance)
		highlightTokenShape.call(this, space, tokenShape, color, alpha)
	}
}

export function measureDistances(segments, entity, shape, options={}) {
	const opts = duplicate(options)

	if (opts.terrainRulerAvailable) {
		if (!opts.gridSpaces)
			opts.gridSpaces = true;
		const firstNewSegmentIndex = segments.findIndex(segment => !segment.ray.dragRulerVisitedSpaces);
		const previousSegments = segments.slice(0, firstNewSegmentIndex);
		const newSegments = segments.slice(firstNewSegmentIndex);
		const distances = previousSegments.map(segment => segment.ray.dragRulerVisitedSpaces[segment.ray.dragRulerVisitedSpaces.length - 1].distance);
		previousSegments.forEach(segment => segment.ray.terrainRulerVisitedSpaces = duplicate(segment.ray.dragRulerVisitedSpaces));
		opts.costFunction = (x, y, costOptions={}) => {
			costOptions.x = x;
			costOptions.y = y;
			return getCostFromSpeedProvider(entity, getAreaFromPositionAndShape({x, y}, shape), costOptions);
		}
		if (previousSegments.length > 0)
			opts.terrainRulerInitialState = previousSegments[previousSegments.length - 1].ray.dragRulerFinalState;
		return distances.concat(terrainRuler.measureDistances(newSegments, opts));
	}
	else {
		// If another module wants to enable grid measurements but disabled grid highlighting,
		// manually set the *duplicate* option's gridSpaces value to true for Foundry
		if(!opts.ignoreGrid && !opts.gridSpaces) {
			opts.gridSpaces = true;
		}
		// If another module wants to disable grid measurements but enabled grid highlighting,
		// manually set the *duplicate* option's gridSpaces value to false for Foundry
		else if(opts.ignoreGrid && opts.gridSpaces) {
			opts.gridSpaces = false;
		}
		return canvas.grid.measureDistances(segments, opts);
	}
}

export function checkDependencies() {
	if (!game.modules.get("socketlib")?.active) {
		console.error("Drag Ruler | The `socketlib` module isn't enabled, but it's required for Drag Ruler to operate properly.");
		if (game.user.isGM) {
			new Dialog({
				title: game.i18n.localize("drag-ruler.dependencies.socketlib.title"),
				content: `<h2>${game.i18n.localize("drag-ruler.dependencies.socketlib.title")}</h2><p>${game.i18n.localize("drag-ruler.dependencies.socketlib.text")}</p>`,
				buttons: {
					ok: {
						icon: '<i class="fas fa-check"></i>',
						label: game.i18n.localize("drag-ruler.dependencies.ok")
					}
				},
			}).render(true);
		}
	}
	else if (!game.modules.get("terrain-ruler")?.active && game.user.isGM && !game.settings.get(settingsKey, "neverShowTerrainRulerHint")) {
		const lastHint = game.settings.get(settingsKey, "lastTerrainRulerHintTime");
		if (Date.now() - lastHint > 604800000) { // One week
			let enabledTerrainModule;
			if (game.modules.get("enhanced-terrain-layer")?.active) {
				enabledTerrainModule = game.modules.get("enhanced-terrain-layer").data.title;
			}
			else if (game.modules.get("TerrainLayer")?.active) {
				enabledTerrainModule = game.modules.get("TerrainLayer").data.title;
			}
			if (enabledTerrainModule) {
				new Dialog({
					title: game.i18n.localize("drag-ruler.dependencies.terrain-ruler.title"),
					content: `<h2>${game.i18n.localize("drag-ruler.dependencies.terrain-ruler.title")}</h2><p>${game.i18n.format("drag-ruler.dependencies.terrain-ruler.text", {moduleName: enabledTerrainModule})}</p>`,
					buttons: {
						ok: {
							icon: '<i class="fas fa-check"></i>',
							label: game.i18n.localize("drag-ruler.dependencies.ok"),
							callback: () => game.settings.set(settingsKey, "lastTerrainRulerHintTime", Date.now()),
						},
						neverShowAgain: {
							icon: '<i class="fas fa-times"></i>',
							label: game.i18n.localize("drag-ruler.dependencies.terrain-ruler.neverShowAgain"),
							callback: () => game.settings.set(settingsKey, "neverShowTerrainRulerHint", true),
						}
					},
					close: () => game.settings.set(settingsKey, "lastTerrainRulerHintTime", Date.now())
				}).render(true);
			}
		}
	}
}
