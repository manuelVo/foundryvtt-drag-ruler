import {getGridPositionFromPixelsObj, getPixelsFromGridPositionObj} from "./foundry_fixes.js";
import {moveWithoutAnimation, togglePathfinding} from "./keybindings.js";
import {debugGraphics} from "./main.js";
import {settingsKey} from "./settings.js";
import {getSnapPointForTokenObj, iterPairs} from "./util.js";

import * as GridlessPathfinding from "../wasm/gridless_pathfinding.js";
import {PriorityQueueSet, ProcessOnceQueue} from "./data_structures.js";

class Cache {
	constructor() {
		this.nodes = new Map();
		this.background = {
			queue: new ProcessOnceQueue(),
			nextJobId: null
		}
	}

	addCache(cacheId) {
		const nodes = new Array(gridHeight);
		for (let y = 0; y < gridHeight; y++) {
			nodes[y] = new Array(gridWidth);
			for (let x = 0; x < gridWidth; x++) {
				nodes[y][x] = {x, y, nodes};
			}
		}
		this.nodes.set(cacheId, nodes);
	}
}

const maxBackgroundCachingMillis = 10;
const cache = new Cache();

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
		const cachedNodes = getCachedNodes(token);
		const firstNode = calculatePath(from, to, cachedNodes, token, previousWaypoints);
		if (!firstNode)
			return null;
		paintGriddedPathfindingDebug(firstNode, token);
		const path = [];
		let currentNode = firstNode;
		while (currentNode) {
			// TODO Check if the distance doesn't change
			if (path.length >= 2 && !stepCollidesWithWall(path[path.length - 2], currentNode.node, token))
				// Replace last waypoint if the current waypoint leads to a valid path
				path[path.length - 1] = {x: currentNode.node.x, y: currentNode.node.y};
			else
				path.push({x: currentNode.node.x, y: currentNode.node.y});
			currentNode = currentNode.next;
		}
		return path;
	}
}

function getNode(pos, cachedNodes, token, initialize = true) {
	const node = cachedNodes[pos.y][pos.x];
	if (initialize && !node.edges) {
		node.edges = [];
		for (const neighborPos of canvas.grid.grid.getNeighbors(pos.y, pos.x).map(([y, x]) => {return {x, y};})) {
			if (neighborPos.x < 0 || neighborPos.y < 0 || neighborPos.x >= gridWidth || neighborPos.y >= gridHeight) {
				continue;
			}

			// TODO Work with pixels instead of grid locations
			if (!stepCollidesWithWall(pos, neighborPos, token)) {
				const isDiagonal = node.x !== neighborPos.x && node.y !== neighborPos.y && canvas.grid.type === CONST.GRID_TYPES.SQUARE;
				const neighbor = getNode(neighborPos, cachedNodes, token, false);

				// Count 5-10-5 diagonals as 1.5 (so two add up to 3) and 5-5-5 diagonals as 1.0001 (to discourage unnecessary diagonals)
				// TODO Account for difficult terrain
				let edgeCost = isDiagonal ? (use5105 ? 1.5 : 1.0001) : 1;
				node.edges.push({target: neighbor, cost: edgeCost});
			}
		}
	}
	return node;
}

function calculatePath(from, to, cachedNodes, token, previousWaypoints) {
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
			node: getNode(from, cachedNodes, token),
			cost: startCost,
			estimated: startCost + estimateCost(from, to),
			previous: null
		}
	);

	while (nextNodes.hasNext()) {
		// Get node with cheapest estimate
		const currentNode = nextNodes.pop();
		if (currentNode.node.x === to.x && currentNode.node.y === to.y) {
			return buildPathNodes(currentNode);
		}
		previousNodes.add(currentNode.node);
		for (const edge of currentNode.node.edges) {
			const neighborNode = getNode(edge.target, cachedNodes, token);
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

/**
 * Now we've found the path, we know the final node, and each node links to the previous one.
 * Reverse this list and return the first node in the path, with each node linking to the next
 */
function buildPathNodes(lastNode) {
	let currentNode = lastNode;
	let previousNode = null;
	while (currentNode) {
		const pathNode = {
			node: currentNode.node,
			cost: currentNode.cost,
			next: previousNode
		}
		previousNode = pathNode;
		currentNode = currentNode.previous;
	}
	return previousNode;
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
	let stepStart, stepEnd;
	if (token) {
		stepStart = getSnapPointForTokenObj(getPixelsFromGridPositionObj(from), token);
		stepEnd = getSnapPointForTokenObj(getPixelsFromGridPositionObj(to), token);
	} else {
		stepStart = getSnapPointForTokenObj(getPixelsFromGridPositionObj)
	}

	return canvas.walls.checkCollision(new Ray(stepStart, stepEnd));
}

export function wipePathfindingCache() {
	window.cancelIdleCallback(cache.background.nextJobId);
	cache.nodes.clear();
	cache.background.queue.reset();
	cache.background.nextJobId = null;

	for (const pathfinder of gridlessPathfinders.values()) {
		GridlessPathfinding.free(pathfinder);
	}
	gridlessPathfinders.clear();
	if (debugGraphics)
		debugGraphics.removeChildren().forEach(c => c.destroy());
}

/**
 * Build a cache ID based on the current token's data and then retrieve the cache to use from that
 */
function getCachedNodes(token) {
	const cacheData = {};

	cacheData.tokenWidth = token.width;
	cacheData.tokenHeight = token.height;

	// If levels is enabled, the token's elevation is relevant to the cache
	if (game.modules.get("levels")?.active) {
		cacheData.elevation = token.data.elevation;
	}

	const cacheId = JSON.stringify(cacheData);
	// Create a cache if we don't already have one
	if (!cache.nodes.has(cacheId)) {
		cache.addCache(cacheId);
		startBackgroundCaching(cacheId, token);
	}
	return cache.nodes.get(cacheId);
}

/**
 * Start background caching from the token's current position
 */
function startBackgroundCaching(cacheId, token) {
	cache.background.queue.push(getNode(getGridPositionFromPixelsObj(token.position), cache.nodes.get(cacheId), token));

	// If the node was actually pushed to the queue (i.e. it wasn't already processed) then schedule
	// a background caching job
	if (!cache.background.nextJobId && cache.background.queue.hasNext()) {
		cache.background.nextJobId = window.requestIdleCallback(() => backgroundCache(token));
	}

}

function backgroundCache(token) {
	// Run through a batch of nodes and cache them, if necessary
	const endTime = performance.now() + maxBackgroundCachingMillis;
	while (cache.background.queue.hasNext() && performance.now() < endTime) {
		let node = cache.background.queue.pop();
		getNode(node, node.nodes, token);
		for (let edge of node.edges) {
			cache.background.queue.push(edge.target);
		}
	}

	// If there are still more nodes to process, schedule another batch
	if (cache.background.queue.hasNext()) {
		cache.background.nextJobId = window.requestIdleCallback(() => backgroundCache(token));
	} else {
		cache.background.nextJobId = null;
	}
}

export function initializePathfinding() {
	gridWidth = Math.ceil(canvas.dimensions.width / canvas.grid.w);
	gridHeight = Math.ceil(canvas.dimensions.height / canvas.grid.h);
}

function paintGriddedPathfindingDebug(firstNode, token) {
	if (!CONFIG.debug.dragRuler)
		return;

	debugGraphics.removeChildren().forEach(c => c.destroy());
	let currentNode = firstNode;
	while (currentNode) {
		let text = new PIXI.Text(currentNode.cost.toFixed(1));
		let pixels = getSnapPointForTokenObj(getPixelsFromGridPositionObj(currentNode.node), token);
		text.anchor.set(0.5, 1.0);
		text.x = pixels.x;
		text.y = pixels.y;
		debugGraphics.addChild(text);
		currentNode = currentNode.next;
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
