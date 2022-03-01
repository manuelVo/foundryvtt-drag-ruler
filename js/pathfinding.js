import {getGridPositionFromPixelsObj, getPixelsFromGridPositionObj} from "./foundry_fixes.js";
import {moveWithoutAnimation, togglePathfinding} from "./keybindings.js";
import {debugGraphics} from "./main.js";
import {settingsKey} from "./settings.js";
import {getSnapPointForTokenObj, iterPairs} from "./util.js";

import * as GridlessPathfinding from "../wasm/gridless_pathfinding.js";
import {PriorityQueueSet, ProcessOnceQueue} from "./data_structures.js";

let iterationNodesCached = 0;
const maxNodesCachedPerIteration = 100;
const maxBackgroundNodesCachedPerIteration = 10;

let backgroundCacheQueue = undefined;
let nextBackgroundCacheJobId;

let cachedNodes = undefined;
let cacheElevation;
let use5105 = false;
let gridlessPathfinders = new Map();
let gridWidth, gridHeight;

export function isPathfindingEnabled() {
	if (this.user !== game.user)
		return false;
	if (!game.user.isGM && !game.settings.get(settingsKey, "allowPathfinding"))
		return false;
	if (moveWithoutAnimation)
		return false;
	return game.settings.get(settingsKey, "autoPathfinding") != togglePathfinding;
}

export function findPath(from, to, token, previousWaypoints) {
	checkCacheValid(token);
	startBackgroundInitialiseCache(to, token);

	iterationNodesCached = 0;

	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		let tokenSize = Math.max(token.data.width, token.data.height) * canvas.dimensions.size;
		let pathfinder = gridlessPathfinders.get(tokenSize);
		if (!pathfinder) {
			pathfinder = GridlessPathfinding.initialize(canvas.walls.placeables, tokenSize, token.data.elevation, Boolean(game.modules.get("levels")?.active));
			gridlessPathfinders.set(tokenSize, pathfinder);
		}
		paintGridlessPathfindingDebug(pathfinder);
		return GridlessPathfinding.findPath(pathfinder, from, to);
	} else {
		const lastNode = calculatePath(from, to, token, previousWaypoints);
		if (!lastNode) {
			return null;
		}
		paintGriddedPathfindingDebug(pathNodes, token);
		const path = [];
		let currentNode = lastNode.previous;
		while (currentNode) {
			// TODO Check if the distance doesn't change
			if (path.length >= 2 && !stepCollidesWithWall(path[path.length - 2], currentNode.node, token)) {
				// Replace last waypoint if the current waypoint leads to a valid path
				path[path.length - 1] = {x: currentNode.node.x, y: currentNode.node.y};
			} else {
				path.push({x: currentNode.node.x, y: currentNode.node.y});
			}
			currentNode = lastNode.previous;
		}
		return path;
	}
}

/**
 * Start off a background job to cache nodes, starting from the current ("to") node
 */
function startBackgroundInitialiseCache(to, token) {
	if (!backgroundCacheQueue) {
		backgroundCacheQueue = new ProcessOnceQueue();
		backgroundCacheQueue.push(getNode(to, token, false));
		nextBackgroundCacheJobId = window.requestIdleCallback(() => backgroundInitialiseCache(token));
	}
}

/**
 * Cache a batch of nodes then, if there are more nodes to cache, queue up another job to cache more
 */
function backgroundInitialiseCache(token) {
	iterationNodesCached = 0;
	let backgroundNodesCached = 0;

	while (backgroundCacheQueue.hasNext() && backgroundNodesCached < maxBackgroundNodesCachedPerIteration) {
		let node = backgroundCacheQueue.pop();
		if (!node.edges) {
			node = getNode(node, token);
			backgroundNodesCached++;
		}
		for (const edge of node.edges) {
			const edgeNode = getNode(edge.target, token, false);
			backgroundCacheQueue.push(edgeNode);
		}
	}

	if (backgroundCacheQueue.hasNext()) {
		nextBackgroundCacheJobId = window.requestIdleCallback(() => backgroundInitialiseCache(token));
	}
}

function getNode(pos, token, initialize = true) {
	if (!cachedNodes)
		cachedNodes = new Array(gridHeight);
	if (!cachedNodes[pos.y])
		cachedNodes[pos.y] = new Array(gridWidth);
	if (!cachedNodes[pos.y][pos.x]) {
		cachedNodes[pos.y][pos.x] = pos;
	}

	const node = cachedNodes[pos.y][pos.x];
	if (initialize && !node.edges) {
		if (iterationNodesCached >= maxNodesCachedPerIteration) return;
		iterationNodesCached++;

		node.edges = [];
		for (const neighborPos of canvas.grid.grid.getNeighbors(pos.y, pos.x).map(([y, x]) => {return {x, y};})) {
			if (neighborPos.x < 0 || neighborPos.y < 0 || neighborPos.x > gridWidth || neighborPos.y > gridHeight) {
				continue;
			}

			// TODO Work with pixels instead of grid locations
			if (!stepCollidesWithWall(neighborPos, pos, token)) {
				const isDiagonal = node.x !== neighborPos.x && node.y !== neighborPos.y && canvas.grid.type === CONST.GRID_TYPES.SQUARE;
				const neighbor = getNode(neighborPos, token, false);

				// Count 5-10-5 diagonals as 1.5 (so two add up to 3) and 5-5-5 diagonals as 1.0001 (to discourage unnecessary diagonals)
				// TODO Account for difficult terrain
				let edgeCost = isDiagonal ? (use5105 ? 1.5 : 1.0001) : 1;
				node.edges.push({target: neighbor, cost: edgeCost});
			}
		}
	}
	return node;
}

function calculatePath(from, to, token, previousWaypoints) {
	use5105 = game.system.id === "pf2e" || canvas.grid.diagonalRule === "5105";
	let startCost = 0;
	if (use5105 && canvas.grid.type === CONST.GRID_TYPES.SQUARE) {
		previousWaypoints = previousWaypoints.map(w => getGridPositionFromPixelsObj(w));
		startCost = (calcNoDiagonals(previousWaypoints) % 2) * 0.5;
	}

	const nextNodes = new PriorityQueueSet((node1, node2) => node1.node === node2.node, node => node.estimated);
	const previousNodes = new Set();

	nextNodes.pushWithPriority(
		{
			node: getNode({...to, layer: startLayer}, token),
			cost: 0,
			estimated: estimateCost(to, from),
			previous: null
		}
	);

	while (nextNodes.hasNext()) {
		// Get node with cheapest estimate
		const currentNode = nextNodes.pop();
		if (currentNode.node.x === from.x && currentNode.node.y === from.y) {
			return currentNode;
		}
		previousNodes.add(currentNode.node);
		for (const edge of currentNode.node.edges) {
			const neighborNode = getNode(edge.target, token);
			if (!neighborNode) {
				return;
			}
			if (previousNodes.has(neighborNode)) {
				continue;
			}
			const neighbor = {
				node: neighborNode,
				cost: currentNode.cost + edge.cost,
				estimated: currentNode.cost + edge.cost + estimateCost(neighborNode, to),
				previous: currentNode
			};
			nextNodes.pushWithPriority(neighbor);
		}
	}
}

function calcNoDiagonals(waypoints) {
	let diagonals = 0;
	for (const [p1, p2] of iterPairs(waypoints)) {
		diagonals += Math.min(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));
	}
	return diagonals;
}

/**
 * Estimate the travel distance between two points, as the crow flies. Most of the time, this is 1
 * per space, but for a square grid using 5-10-5 diagonals, count each diagonal as an extra 0.5
 */
function estimateCost(pos, target) {
	const distX = Math.abs(pos.x - target.x);
	const distY = Math.abs(pos.y - target.y);
	return Math.max(distX, distY) + (use5105 ? Math.min(distX, distY) * 0.5 : 0);
}

function stepCollidesWithWall(from, to, token) {
	const stepStart = getSnapPointForTokenObj(getPixelsFromGridPositionObj(from), token);
	const stepEnd = getSnapPointForTokenObj(getPixelsFromGridPositionObj(to), token);
	return canvas.walls.checkCollision(new Ray(stepStart, stepEnd));
}

export function wipePathfindingCache() {
	// Cancel background caching
	if (nextBackgroundCacheJobId) window.cancelIdleCallback(nextBackgroundCacheJobId);
	backgroundCacheQueue = undefined;

	// Clear existing cache
	cachedNodes = undefined;

	for (const pathfinder of gridlessPathfinders.values()) {
		GridlessPathfinding.free(pathfinder);
	}
	gridlessPathfinders.clear();
	if (debugGraphics)
		debugGraphics.removeChildren().forEach(c => c.destroy());
}

/**
 * Check if the current cache is still suitable for the path we're about to find. If not, clear the cache
 */
function checkCacheValid(token) {
	// If levels is enabled, the cache is invalid if it was made for a
	if (game.modules.get("levels")?.active) {
		const tokenElevation = token.data.elevation;
		if (tokenElevation !== cacheElevation) {
			cacheElevation = tokenElevation;
			wipePathfindingCache();
		}
	}
}

export function initializePathfinding() {
	gridWidth = Math.ceil(canvas.dimensions.width / canvas.grid.w);
	gridHeight = Math.ceil(canvas.dimensions.height / canvas.grid.h);
}

function paintGriddedPathfindingDebug(lastNode, token) {
	if (!CONFIG.debug.dragRuler)
		return;

	debugGraphics.removeChildren().forEach(c => c.destroy());
	let currentNode = lastNode;
	while (currentNode) {
		let text = new PIXI.Text(currentNode.cost.toFixed(0));
		let pixels = getSnapPointForTokenObj(getPixelsFromGridPositionObj(currentNode.node), token);
		text.anchor.set(0.5, 1.0);
		text.x = pixels.x;
		text.y = pixels.y;
		debugGraphics.addChild(text);
		currentNode = currentNode.previous;
	}
}

function paintGridlessPathfindingDebug(pathfinder) {
	if (!CONFIG.debug.dragRuler)
		return;

	debugGraphics.removeChildren().forEach(c => c.destroy());
	let graphic = new PIXI.Graphics();
	graphic.lineStyle(2, 0x440000);
	for (const point of GridlessPathfinding.debugGetPathfindingPoints(pathfinder)) {
		graphic.drawCircle(point.x, point.y, 5);
	}
	debugGraphics.addChild(graphic);
}
