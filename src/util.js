import {getPixelsFromGridPosition} from "./foundry_fixes.js";
import {findVertexSnapPoint} from "./hex_support.js";
import {disableSnap, moveWithoutAnimation, togglePathfinding} from "./keybindings.js";
import {settingsKey} from "./settings.js";

export function* zip(it1, it2) {
	for (let i = 0; i < Math.min(it1.length, it2.length); i++) {
		yield [it1[i], it2[i]];
	}
}

export function* enumeratedZip(it1, it2) {
	let i = 0;
	for (const [v1, v2] of zip(it1, it2)) {
		yield [i, v1, v2];
		i++;
	}
}

export function* iterPairs(l) {
	for (let i = 1; i < l.length; i++) {
		yield [l[i - 1], l[i]];
	}
}

export function sum(arr) {
	return arr.reduce((a, b) => a + b, 0);
}

// A copy of this function lives in the routinglib module
export function getHexTokenSize(token) {
	const size = token.document.width;
	if (token.document.height !== size) {
		return 1;
	}
	return size;
}

export function getEntityCenter(token) {
	if (token instanceof Token && canvas.grid.isHex) {
		const center = token.center;
		const size = getHexTokenSize(token);
		if (size % 2 === 0) {
			let offset;
			if (canvas.grid.grid.columnar) {
				offset = canvas.grid.grid.w - canvas.grid.grid.h;
			} else {
				offset = canvas.grid.grid.h - canvas.grid.grid.w;
			}
			if (getAltOrientationFlagForToken(token, size)) {
				offset *= -1;
			}
			if (canvas.grid.grid.columnar) {
				center.x -= offset;
				return center;
			} else {
				center.y -= offset;
				return center;
			}
		}
	}
	return token.center;
}

// A copy of this function lives in the routinglib module
export function getAltOrientationFlagForToken(token, size) {
	const hexSizeSupport = game.modules.get("hex-size-support")?.api;
	if (hexSizeSupport) {
		return hexSizeSupport.isAltOrientation(token);
	}
	// In native foundry, tokens of size 2 are oriented like the "alt orientation" from hex-size-support
	// Tokens of size 4 are oriented like alt orientation wasn't set
	return size === 2;
}

// A copy of this function lives in the librouting module
export function getSnapPointForToken(x, y, token) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return {x, y};
	}

	if (canvas.grid.isHex) {
		const size = getHexTokenSize(token);
		if (size % 2 === 0) {
			return findVertexSnapPoint(x, y, getAltOrientationFlagForToken(token, size));
		}
		const [snapX, snapY] = canvas.grid.getCenter(x, y);
		return {x: snapX, y: snapY};
	}

	const [topLeftX, topLeftY] = canvas.grid.getTopLeft(x, y);
	let cellX, cellY;
	if (token.document.width % 2 === 0) cellX = x - canvas.grid.h / 2;
	else cellX = x;
	if (token.document.height % 2 === 0) cellY = y - canvas.grid.h / 2;
	else cellY = y;
	const [centerX, centerY] = canvas.grid.getCenter(cellX, cellY);
	let snapX, snapY;
	// Tiny tokens can snap to the cells corners
	if (token.document.width <= 0.5) {
		const offsetX = x - topLeftX;
		const subGridWidth = Math.floor(canvas.grid.w / 2);
		const subGridPosX = Math.floor(offsetX / subGridWidth);
		snapX = topLeftX + (subGridPosX + 0.5) * subGridWidth;
	}
	// Tokens with odd multipliers (1x1, 3x3, ...) and tokens smaller than 1x1 but bigger than 0.5x0.5 snap to the center of the grid cell
	else if (Math.round(token.document.width) % 2 === 1 || token.document.width < 1) {
		snapX = centerX;
	}
	// All remaining tokens (those with even or fractional multipliers on square grids) snap to the intersection points of the grid
	else {
		snapX = centerX + canvas.grid.w / 2;
	}
	if (token.document.height <= 0.5) {
		const offsetY = y - topLeftY;
		const subGridHeight = Math.floor(canvas.grid.h / 2);
		const subGridPosY = Math.floor(offsetY / subGridHeight);
		snapY = topLeftY + (subGridPosY + 0.5) * subGridHeight;
	} else if (Math.round(token.document.height) % 2 === 1 || token.document.height < 1) {
		snapY = centerY;
	} else {
		snapY = centerY + canvas.grid.h / 2;
	}
	return {x: snapX, y: snapY};
}

export function getSnapPointForTokenObj(pos, token) {
	return getSnapPointForToken(pos.x, pos.y, token);
}

export function getSnapPointForMeasuredTemplate(x, y) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return new PIXI.Point(x, y);
	}
	return canvas.grid.grid.getSnappedPosition(x, y, canvas.templates.gridPrecision);
}

export function getSnapPointForEntity(x, y, entity) {
	const isToken = entity instanceof Token;
	if (isToken) return getSnapPointForToken(x, y, entity);
	else return getSnapPointForMeasuredTemplate(x, y);
}

export function highlightTokenShape(position, shape, color, alpha) {
	const layer = canvas.grid.highlightLayers[this.name];
	if (!layer) return false;
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
			if (canvas.grid.grid.options.even) shiftedRow = 1;
			else shiftedRow = 0;
			if (canvas.grid.grid.columnar) {
				if (space.x % 2 !== 0 && position.x % 2 !== shiftedRow) {
					y += 1;
				}
			} else {
				if (space.y % 2 !== 0 && position.y % 2 !== shiftedRow) {
					x += 1;
				}
			}
		}
		return {x, y};
	});
}

// A copy of this function lives in the routinglib module
export function getTokenShape(token) {
	let scene = canvas.scene;
	if (scene.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return [{x: 0, y: 0}];
	} else if (scene.grid.type === CONST.GRID_TYPES.SQUARE) {
		const topOffset = -Math.floor(token.document.height / 2);
		const leftOffset = -Math.floor(token.document.width / 2);
		const shape = [];
		for (let y = 0; y < token.document.height; y++) {
			for (let x = 0; x < token.document.width; x++) {
				shape.push({x: x + leftOffset, y: y + topOffset});
			}
		}
		return shape;
	} else {
		// Hex grids
		const size = getHexTokenSize(token);
		let shape = [{x: 0, y: 0}];
		if (size >= 2)
			shape = shape.concat([
				{x: 0, y: -1},
				{x: -1, y: -1},
			]);
		if (size >= 3)
			shape = shape.concat([
				{x: 0, y: 1},
				{x: -1, y: 1},
				{x: -1, y: 0},
				{x: 1, y: 0},
			]);
		if (size >= 4)
			shape = shape.concat([
				{x: -2, y: -1},
				{x: 1, y: -1},
				{x: -1, y: -2},
				{x: 0, y: -2},
				{x: 1, y: -2},
			]);
		if (size >= 5)
			shape = shape.concat([
				{x: -2, y: 0},
				{x: 1, y: 1},
				{x: -1, y: 2},
				{x: 0, y: 2},
				{x: 1, y: 2},
				{x: -2, y: 1},
				{x: 2, y: 0},
			]);

		if (getAltOrientationFlagForToken(token, size)) {
			shape.forEach(space => (space.y *= -1));
		}
		if (canvas.grid.grid.columnar)
			shape = shape.map(space => {
				return {x: space.y, y: space.x};
			});
		return shape;
	}
}

export function getTokenSize(token) {
	let w, h;
	if (canvas.grid.isHex) {
		w = h = getHexTokenSize(token);
	} else {
		w = token.document.width;
		h = token.document.height;
	}
	return {w, h};
}

// Tokens that have a size divisible by two (2x2, 4x4, 2x1) have their ruler at the edge of a cell.
// This function applies an offset to to the waypoints that will move the ruler from the edge to the center of the cell
export function applyTokenSizeOffset(waypoints, token) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return waypoints;
	}

	const tokenSize = getTokenSize(token);
	const waypointOffset = {x: 0, y: 0};
	if (canvas.grid.isHex) {
		const isAltOrientation = getAltOrientationFlagForToken(token, getHexTokenSize(token));
		if (canvas.grid.grid.columnar) {
			if (tokenSize.w % 2 === 0) {
				waypointOffset.x = canvas.grid.w / 2;
				if (isAltOrientation) waypointOffset.x *= -1;
			}
		} else {
			if (tokenSize.h % 2 === 0) {
				waypointOffset.y = canvas.grid.h / 2;
				if (isAltOrientation) waypointOffset.y *= -1;
			}
		}
		// If hex size support isn't active leave the waypoints like they are
	} else {
		if (tokenSize.w % 2 === 0) {
			waypointOffset.x = canvas.grid.w / 2;
		}
		if (tokenSize.h % 2 === 0) {
			waypointOffset.y = canvas.grid.h / 2;
		}
	}

	return waypoints.map(w => new PIXI.Point(w.x + waypointOffset.x, w.y + waypointOffset.y));
}

export function setSnapParameterOnOptions(sourceObject, options) {
	// Allow outside modules to override snapping
	if (sourceObject.snapOverride?.active) {
		options.snapOverrideActive = true;
		options.snap = sourceObject.snapOverride.snap;
		sourceObject.snapOverride = undefined; // remove it to prevent any lingering data issues
	} else {
		options.snap = !disableSnap;
	}
}

export function isClose(a, b, delta) {
	return Math.abs(a - b) <= delta;
}

export function getPointer() {
	return canvas.app.renderer.events.pointer;
}

export function getMeasurePosition() {
	const mousePosition = getPointer().getLocalPosition(canvas.tokens);
	const rulerOffset = canvas.controls.ruler.rulerOffset;
	const measurePosition = {x: mousePosition.x + rulerOffset.x, y: mousePosition.y + rulerOffset.y};
	return measurePosition;
}

// isGM function for use during loading when game.user isn't available yet
export function early_isGM() {
	const level = game.data.users.find(u => u._id == game.data.userId).role;
	const gmLevel = CONST.USER_ROLES.ASSISTANT;
	return level >= gmLevel;
}

export function isModuleActive(moduleName) {
	return game.modules.get(moduleName)?.active;
}

export function isPathfindingEnabled() {
	if (!window.routinglib) return false;
	if (this.user !== game.user) return false;
	if (!game.user.isGM && !game.settings.get(settingsKey, "allowPathfinding")) return false;
	if (moveWithoutAnimation) return false;
	return game.settings.get(settingsKey, "autoPathfinding") != togglePathfinding;
}
