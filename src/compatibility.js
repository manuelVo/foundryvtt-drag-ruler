import {getCostFromSpeedProvider} from "./api.js";
import {getColorForDistance} from "./main.js"
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

export function measureDistances(segments, token, shape, gridSpaces=true) {
	const terrainRulerAvailable = game.modules.get("terrain-ruler")?.active && canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS;
	if (terrainRulerAvailable)
		return terrainRuler.measureDistances(segments, {costFunction: (x, y) => getCostFromSpeedProvider(token, getAreaFromPositionAndShape({x, y}, shape), {x, y})});
	else
		return canvas.grid.measureDistances(segments, { gridSpaces });
}
