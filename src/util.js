import {getPixelsFromGridPosition} from "./foundry_fixes.js"

export function* zip(it1, it2) {
	for (let i = 0;i < Math.min(it1.length, it2.length);i++) {
		yield [it1[i], it2[i]]
	}
}

export function getSnapPointForToken(x, y, token) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return new PIXI.Point(x, y);
	}
	if (canvas.grid.isHex) {
		if (game.modules.get("hex-size-support")?.active && CONFIG.hexSizeSupport.getAltSnappingFlag(token)) {
			if (token.document.getFlag("hex-size-support", "borderSize") % 2 === 0) {
				const snapPoint = CONFIG.hexSizeSupport.findVertexSnapPoint(x, y, token, canvas.grid.grid)
				return new PIXI.Point(snapPoint.x, snapPoint.y)
			}
			else {
				return new PIXI.Point(...canvas.grid.getCenter(x, y))
			}
		}
		else {
			return new PIXI.Point(...canvas.grid.getCenter(x, y));
		}
	}

	const [topLeftX, topLeftY] = canvas.grid.getTopLeft(x, y);
	let cellX, cellY;
	if (token.data.width % 2 === 0)
		cellX = x - canvas.grid.h / 2;
	else
		cellX = x;
	if (token.data.height % 2 === 0)
		cellY = y - canvas.grid.h / 2;
	else
		cellY = y;
	const [centerX, centerY] = canvas.grid.getCenter(cellX, cellY);
	let snapX, snapY;
	// Tiny tokens can snap to the cells corners
	if (token.data.width <= 0.5) {
		const offsetX = x - topLeftX;
		const subGridWidth = Math.floor(canvas.grid.w / 2);
		const subGridPosX = Math.floor(offsetX / subGridWidth);
		snapX = topLeftX + (subGridPosX + 0.5) * subGridWidth;
	}
	// Tokens with odd multipliers (1x1, 3x3, ...) and tokens smaller than 1x1 but bigger than 0.5x0.5 snap to the center of the grid cell
	else if (Math.round(token.data.width) % 2 === 1 || token.data.width < 1) {
		snapX = centerX;
	}
	// All remaining tokens (those with even or fractional multipliers on square grids) snap to the intersection points of the grid
	else {
		snapX = centerX + canvas.grid.w / 2;
	}
	if (token.data.height <= 0.5) {
		const offsetY = y - topLeftY;
		const subGridHeight = Math.floor(canvas.grid.h / 2);
		const subGridPosY = Math.floor(offsetY / subGridHeight);
		snapY = topLeftY + (subGridPosY + 0.5) * subGridHeight;
	}
	else if (Math.round(token.data.height) % 2 === 1 || token.data.height < 1) {
		snapY = centerY;
	}
	else {
		snapY = centerY + canvas.grid.h / 2;
	}
	return new PIXI.Point(snapX, snapY);
}

export function getSnapPointForMeasuredTemplate(x, y) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return new PIXI.Point(x, y);
	}
	let subgridWidth, subgridHeight;
	if (canvas.grid.type === CONST.GRID_TYPES.SQUARE) {
		subgridWidth = subgridHeight = canvas.dimensions.size / 2;
	}
	else {
		if (canvas.grid.grid.columns) {
			subgridWidth = canvas.grid.w / 4;
			subgridHeight = canvas.grid.h / 2;
		}
		else {
			subgridWidth = canvas.grid.w / 2;
			subgridHeight = canvas.grid.h / 4;
		}
	}
	const snappedX = Math.round(x / subgridWidth) * subgridWidth;
	const snappedY = Math.round(y / subgridHeight) * subgridHeight;
	return new PIXI.Point(snappedX, snappedY);
}

export function getSnapPointForEntity(x, y, entity) {
	const isToken = entity instanceof Token;
	if (isToken)
		return getSnapPointForToken(x, y, entity);
	else
		return getSnapPointForMeasuredTemplate(x, y);
}

export function highlightTokenShape(position, shape, color, alpha) {
	const layer = canvas.grid.highlightLayers[this.name];
    if ( !layer )
		return false;
	const area = getAreaFromPositionAndShape(position, shape);
	for (const space of area) {
		const [x, y] = getPixelsFromGridPosition(space.x, space.y);
		canvas.grid.grid.highlightGridPosition(layer, {x, y, color, alpha: 0.25 * alpha});
	}
}

export function getAreaFromPositionAndShape(position, shape) {
	return shape.map(space => {
		let x = position.x + space.x;
		let y = position.y + space.y;
		if (canvas.grid.isHex) {
			let shiftedRow;
			if (canvas.grid.grid.options.even)
				shiftedRow = 1
			else
				shiftedRow = 0
			if (canvas.grid.grid.options.columns) {
				if (space.x % 2 !== 0 && position.x % 2 !== shiftedRow) {
					y += 1;
				}
			}
			else {
				if (space.y % 2 !== 0 && position.y % 2 !== shiftedRow) {
					x += 1;
				}
			}
		}
		return {x, y}
	});
}

export function getTokenShape(token) {
	if (token.scene.data.gridType === CONST.GRID_TYPES.GRIDLESS) {
		return [{x: 0, y: 0}]
	}
	else if (token.scene.data.gridType === CONST.GRID_TYPES.SQUARE) {
		const topOffset = -Math.floor(token.data.height / 2)
		const leftOffset = -Math.floor(token.data.width / 2)
		const shape = []
		for (let y = 0;y < token.data.height;y++) {
			for (let x = 0;x < token.data.width;x++) {
				shape.push({x: x + leftOffset, y: y + topOffset})
			}
		}
		return shape
	}
	else {
		// Hex grids
		if (game.modules.get("hex-size-support")?.active && CONFIG.hexSizeSupport.getAltSnappingFlag(token)) {
			const borderSize = token.data.flags["hex-size-support"].borderSize;
			let shape = [{x: 0, y: 0}];
			if (borderSize >= 2)
				shape = shape.concat([{x: 0, y: -1}, {x: -1, y: -1}]);
			if (borderSize >= 3)
				shape = shape.concat([{x: 0, y: 1}, {x: -1, y: 1}, {x: -1, y: 0}, {x: 1, y: 0}]);
			if (borderSize >= 4)
				shape = shape.concat([{x: -2, y: -1}, {x: 1, y: -1}, {x: -1, y: -2}, {x: 0, y: -2}, {x: 1, y: -2}])

			if (Boolean(CONFIG.hexSizeSupport.getAltOrientationFlag(token)) !== canvas.grid.grid.options.columns)
				shape.forEach(space => space.y *= -1);
			if (canvas.grid.grid.options.columns)
				shape = shape.map(space => {return {x: space.y, y: space.x}});
			return shape;
		}
		else {
			return [{x: 0, y: 0}];
		}
	}
}

export function getTokenSize(token) {
	let w, h;
	const hexSizeSupportBorderSize = token.data.flags["hex-size-support"]?.borderSize;
	if (hexSizeSupportBorderSize > 0) {
		w = h = hexSizeSupportBorderSize
	}
	else {
		w = token.data.width
		h = token.data.height
	}
	return {w, h};
}

// Tokens that have a size divisible by two (2x2, 4x4, 2x1) have their ruler at the edge of a cell.
// This function applies an offset to to the waypoints that will move the ruler from the edge to the center of the cell
export function applyTokenSizeOffset(waypoints, token) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return waypoints
	}

	const tokenSize = getTokenSize(token);
	const waypointOffset = {x: 0, y: 0};
	if (canvas.grid.isHex) {
		if (game.modules.get("hex-size-support")?.active) {
			const isAltOrientation = CONFIG.hexSizeSupport.getAltOrientationFlag(token);
			if (canvas.grid.grid.options.columns) {
				if (tokenSize.w % 2 === 0) {
					waypointOffset.x = canvas.grid.w / 2;
					if (!isAltOrientation)
						waypointOffset.x *= -1;
				}
			}
			else {
				if (tokenSize.h % 2 === 0) {
					waypointOffset.y = canvas.grid.h / 2;
					if (isAltOrientation)
						waypointOffset.y *= -1;
				}
			}
		}
		// If hex size support isn't active leave the waypoints like they are
	}
	else {
		if (tokenSize.w % 2 === 0) {
			waypointOffset.x = canvas.grid.w / 2;
		}
		if (tokenSize.h % 2 === 0) {
			waypointOffset.y = canvas.grid.h / 2;
		}
	}

	return waypoints.map(w => new PIXI.Point(w.x + waypointOffset.x, w.y + waypointOffset.y))
}

export function setSnapParameterOnOptions(sourceObject, options) {
	// Allow outside modules to override snapping
	if (sourceObject.snapOverride?.active) {
		options.snapOverrideActive = true;
		options.snap = sourceObject.snapOverride.snap;
		sourceObject.snapOverride = undefined; // remove it to prevent any lingering data issues
	}
	else {
		options.snap = !game.keyboard._downKeys.has("Shift");
	}
}

export function isClose(a, b, delta) {
	return Math.abs(a - b) <= delta;
}
