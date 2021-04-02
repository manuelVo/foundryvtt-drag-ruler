import {getColorForDistance} from "./main.js"
import {highlightTokenShape} from "./util.js"

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
