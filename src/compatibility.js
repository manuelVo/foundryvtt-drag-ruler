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

export function measureDistances(segments, token, shape, gridSpaces=true, options={}) {
	const opts = duplicate(options)
	opts.gridSpaces = gridSpaces;
	const terrainRulerAvailable = game.modules.get("terrain-ruler")?.active && canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS;
	if (terrainRulerAvailable) {
		const firstNewSegmentIndex = segments.findIndex(segment => !segment.ray.dragRulerVisitedSpaces);
		const previousSegments = segments.slice(0, firstNewSegmentIndex);
		const newSegments = segments.slice(firstNewSegmentIndex);
		const distances = previousSegments.map(segment => segment.ray.dragRulerVisitedSpaces[segment.ray.dragRulerVisitedSpaces.length - 1].distance);
		previousSegments.forEach(segment => segment.ray.terrainRulerVisitedSpaces = duplicate(segment.ray.dragRulerVisitedSpaces));
		opts.costFunction = (x, y) => getCostFromSpeedProvider(token, getAreaFromPositionAndShape({x, y}, shape), {x, y});
		if (previousSegments.length > 0)
			opts.terrainRulerInitialState = previousSegments[previousSegments.length - 1];
		return distances.concat(terrainRuler.measureDistances(newSegments, opts));
	}
	else {
		return canvas.grid.measureDistances(segments, options);
	}
}

