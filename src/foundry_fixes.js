// Wrapper to fix a FoundryVTT bug that causes the return values of canvas.grid.grid.getPixelsFromGridPosition to be ordered inconsistently

// This code could be phased out. The bug that caused the creation of these functions is now fixed, so this is only a wrapper function now
export function getPixelsFromGridPosition(xGrid, yGrid) {
	let coord = getPixelsFromGridPositionObj({x: xGrid, y: yGrid});
	return [coord.x, coord.y];
}

// This code could be phased out. The bug that caused the creation of these functions is now fixed, so this is only a wrapper function now
export function getGridPositionFromPixels(xPixel, yPixel) {
	let coord = getGridPositionFromPixelsObj({x: xPixel, y: yPixel});
	return [coord.x, coord.y];
}

// This code could be phased out. The bug that caused the creation of these functions is now fixed, so this is only a wrapper function now
export function getGridPositionFromPixelsObj(o) {
	const coord = canvas.grid.getOffset(o);
	return {x: coord.j, y: coord.i};
}

// This code could be phased out. The bug that caused the creation of these functions is now fixed, so this is only a wrapper function now
export function getPixelsFromGridPositionObj(o) {
	return canvas.grid.getTopLeftPoint({j: o.x, i: o.y});
}

export function getCenterFromGridPositionObj(o) {
	const r = getPixelsFromGridPositionObj(o);
	[r.x, r.y] = canvas.grid.getCenter(r.x, r.y);
	return r;
}
