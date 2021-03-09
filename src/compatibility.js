import {getPixelsFromGridPosition} from "./foundry_fixes.js"
import {getColorForDistance} from "./main.js"

export function getHexSizeSupportTokenGridCenter(token) {
	const tokenCenterOffset = CONFIG.hexSizeSupport.getCenterOffset(token)
	const tokenCenter = {x: token.x + tokenCenterOffset.x, y: token.y + tokenCenterOffset.y}
	if (token.getFlag("hex-size-support", "borderSize") % 2 === 1)
		return tokenCenter
	if (canvas.grid.grid.columns) {
		let hexOffset = canvas.grid.w / 2
		if (!CONFIG.hexSizeSupport.getAltOrientationFlag(token))
			hexOffset *= -1
		tokenCenter.x += hexOffset
	}
	else {
		let hexOffset = canvas.grid.h / 2
		if (CONFIG.hexSizeSupport.getAltOrientationFlag(token))
			hexOffset *= -1
		tokenCenter.y += hexOffset
	}
	return tokenCenter
}

export function highlightMeasurementTerrainRuler(ray, startDistance) {
	for (const space of ray.terrainRulerVisitedSpaces) {
		const [x, y] = getPixelsFromGridPosition(space.x, space.y);
		const color = getColorForDistance.call(this, startDistance, space.distance)
		canvas.grid.highlightPosition(this.name, {x, y, color: color})
	}
}
