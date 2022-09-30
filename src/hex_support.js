/**
 * Functions taken directly from the hex-size-support module (https://github.com/Ourobor/Hex-Size-Support/releases/tag/1.1.0).
 * Unless otherwise stated, these functions are taken as-is.
 */

/**
 * Altered version of this function.
 * - Instead of taking a token as a parameter to retrieve the altOrientationFlag, receive the flag value directly
 * - Instead of taking a grid parameter, get the grid value from the globas canvas
 */
export function findVertexSnapPoint(x, y, altOrientationFlag) {
	const grid = canvas.grid.grid;
	if (grid.columns) {
		return findSnapPointCols(x, y, grid.h, grid.w, altOrientationFlag);
	} else {
		return findSnapPointRows(x, y, grid.h, grid.w, altOrientationFlag);
	}
}

function findSnapPointRows(x, y, h, w, alt) {
	let xOffset = 0.0;
	if (canvas.grid.grid.even) {
		xOffset = -0.5;
	}

	let yOffset1 = 0.75;
	let yOffset2 = 0.0;
	if (alt) {
		yOffset1 = 0.25;
		yOffset2 = 1.0;
	}

	let row1 = calculateSnapPointsRows(x, y, h, w, 0.5 + xOffset, yOffset1);
	let row2 = calculateSnapPointsRows(x, y, h, w, 1.0 + xOffset, yOffset2);

	let dist1 = Math.pow(row1.x - x, 2) + Math.pow(row1.y - y, 2);
	let dist2 = Math.pow(row2.x - x, 2) + Math.pow(row2.y - y, 2);

	if (dist1 < dist2) {
		return row1;
	} else {
		return row2;
	}
}

function calculateSnapPointsRows(x, y, h, w, xOff, yOff) {
	let c = Math.floor((x + (0.5 - xOff) * w) / w + 1);
	let r = Math.floor((y + (0.75 - yOff) * h) / (1.5 * h) + 1);

	let snapX = c * w - (1 - xOff) * w;
	let snapY = r * h * 1.5 - (1.5 - yOff) * h;

	return {x: snapX, y: snapY};
}

function findSnapPointCols(x, y, h, w, alt) {
	let yOffset = 0.0;
	if (canvas.grid.grid.even) {
		yOffset = -0.5;
	}

	let xOffset1 = 0.25;
	let xOffset2 = 1.0;
	if (alt) {
		xOffset1 = 0.75;
		xOffset2 = 0.0;
	}

	let row1 = calculateSnapPointsCols(x, y, h, w, xOffset1, 0.5 + yOffset);
	let row2 = calculateSnapPointsCols(x, y, h, w, xOffset2, 1.0 + yOffset);

	let dist1 = Math.pow(row1.x - x, 2) + Math.pow(row1.y - y, 2);
	let dist2 = Math.pow(row2.x - x, 2) + Math.pow(row2.y - y, 2);

	if (dist1 < dist2) {
		return row1;
	} else {
		return row2;
	}
}

function calculateSnapPointsCols(x, y, h, w, xOff, yOff) {
	let c = Math.floor((x + (0.75 - xOff) * w) / (1.5 * w) + 1);
	let r = Math.floor((y + (0.5 - yOff) * h) / h + 1);

	let snapX = c * w * 1.5 - (1.5 - xOff) * w;
	let snapY = r * h - (1 - yOff) * h;

	return {x: snapX, y: snapY};
}
