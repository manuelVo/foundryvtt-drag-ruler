// Wrapper to fix a FoundryVTT bug that causes the return values of canvas.grid.grid.getPixelsFromGridPosition to be ordered inconsistently

// https://gitlab.com/foundrynet/foundryvtt/-/issues/4705
export function getPixelsFromGridPosition(xGrid, yGrid) {
	if (canvas.grid.isHex) {
		return canvas.grid.grid.getPixelsFromGridPosition(yGrid, xGrid)
	}
	const [x, y] = canvas.grid.grid.getPixelsFromGridPosition(xGrid, yGrid)
	if (canvas.grid.type === CONST.GRID_TYPES.SQUARE)
		return [y, x]
	return [x, y]
}

// Wrapper to fix a FoundryVTT bug that causes the return values of canvas.grid.grid.getPixelsFromGridPosition to be ordered inconsistently
// https://gitlab.com/foundrynet/foundryvtt/-/issues/4705
export function getGridPositionFromPixels(xPixel, yPixel) {
	const [x, y] = canvas.grid.grid.getGridPositionFromPixels(xPixel, yPixel)
	if (canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS)
		return [y, x]
	return [x, y]
}
