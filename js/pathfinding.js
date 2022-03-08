import {getGridPositionFromPixelsObj, getPixelsFromGridPositionObj} from "./foundry_fixes.js";
import {moveWithoutAnimation, togglePathfinding} from "./keybindings.js";
import {debugGraphics} from "./main.js";
import {settingsKey} from "./settings.js";
import {getSnapPointForTokenObj, getTokenSize, iterPairs} from "./util.js";

import * as GridlessPathfinding from "../wasm/gridless_pathfinding.js";
import {PriorityQueueSet, ProcessOnceQueue} from "./data_structures.js";

/**
 * Class to hold all the cached node data, and functions to deal with caching.
 * 
 * Since pathfinding can depend on several factors, e.g. the token's size, we keep
 * several caches, keyed by all the data relevant to pathfinding. If we already have
 * the maximum number of caches and we need to create another one, we discard the
 * one not used for the longest.
 * 
 * When we select a token, or a token we have selected updates, we start caching
 * in the background so, when we do start pathfinding, it's very performant.
 * 
 * Background caching starts by trying to run an idle process (when the browser is
 * otherwise not busy), but if it can't do that after an amount of time (e.g. the
 * CPU is very slow and is busy) then we instead start caching a few nodes each
 * frame. 
 */
class Cache {
	static maxCacheIds = 5;
	static maxBackgroundCachingMillis = 10;
	static maxAnimationCachingMillis = 5;
	static backgroundCachingTimeoutMillis = 200;

	constructor() {
		this.nodes = new Map();
		this.lastUsed = new Map();
		this.background = {
			queues: new Map(),
			nextJobId: null,
			nextTimeoutId: null,
			nextAnimationFrameId: null
		}
	}

	clear() {
		this.nodes.clear();
		this.lastUsed.clear();
		this.background.queues.clear();
		if (this.background.nextJobId) {
			window.cancelIdleCallback(this.background.nextJobId);
			this.background.nextJobId = null;
		}
		this.cancelTimeout();
		this.cancelAnimationFrame();
	}

	/**
	 * Build a cache ID from the information that could make a difference to the pathfinding algorithm
	 */
	getCacheId(token) {
		const cacheData = {};

		// Different-sized tokens snap to different points on the grid,
		// so they might follow a different path to other tokens
		cacheData.tokenSize = getTokenSize(token);
		if (canvas.grid.isHex && game.modules.get("hex-size-support")?.active) {
			cacheData.hexConfig = {
				altOrientation: CONFIG.hexSizeSupport.getAltOrientationFlag(token),
				altSnapping: CONFIG.hexSizeSupport.getAltSnappingFlag(token)
			}
		}

		// If levels is enabled, the token's elevation can affect which walls
		// they need to worry about
		if (game.modules.get("levels")?.active) {
			cacheData.elevation = token.data.elevation;
		}

		const cacheId = JSON.stringify(cacheData);
		this.ensureCacheExists(cacheId);
		return cacheId;
	}

	ensureCacheExists(cacheId) {
		// Track that we've last used this cache right now
		this.lastUsed.set(cacheId, Date.now());

		// Get the nodes for the cacheId. If we don't already have one, create one
		if (!this.nodes.has(cacheId)) {
			const cachedNodes = new Array(gridHeight);
			for (let y = 0; y < gridHeight; y++) {
				cachedNodes[y] = new Array(gridWidth);
				for (let x = 0; x < gridWidth; x++) {
					cachedNodes[y][x] = {x, y};
				}
			}
			this.nodes.set(cacheId, cachedNodes);
			this.background.queues.set(cacheId, new ProcessOnceQueue());

			// Since we're adding a new cache, check if we have too many and,
			// if we do, get rid of the one that was last used longest ago
			if (this.lastUsed.size > Cache.maxCacheIds) {
				// Build an array from the last used entries, sort in ascending order, and get the first
				// element (with the lowest last-used value) as the oldest entry, then retrieve the cache ID
				// from that element
				const oldestCacheId = Array.from(this.lastUsed.entries()).sort((a, b) => a[1] - b[1])[0][0];

				this.nodes.delete(oldestCacheId);
				this.lastUsed.delete(oldestCacheId);
				this.background.queues.delete(oldestCacheId);
			}
		}
	}

	/**
	 * Get the cache associated with the given cache ID, creating a new one
	 * if we don't already have one
	 */
	getCachedNodes(token) {
		const cacheId = this.getCacheId(token);
		return this.nodes.get(cacheId);
	}

	/**
	 * Start background caching from the token's current position
	 */
	startBackgroundCaching(token) {
		const cacheId = this.getCacheId(token);
		this.background.queues.get(cacheId).push(
			{
				value: {
					pos: getGridPositionFromPixelsObj(token.position)
				},
				cacheId,
				token
			}
		);
		this.scheduleBackgroundCache();
	}

	/**
	 * Find if any of the caches have more nodes to background cache. If there is, then schedule a background
	 * caching job for that queue
	 */
	scheduleBackgroundCache() {
		// If we already have a nextJobId, then don't start another one
		if (this.background.nextJobId) return;

		// Find the latest-used cache that has nodes left to cache
		const latestCacheId = this.getLatestCacheId();
		if (latestCacheId) {
			this.background.nextJobId = window.requestIdleCallback(
				() => this.runBackgroundCache(this.background.queues.get(latestCacheId))
			);
			this.scheduleTimeout();
		}
	}

	/**
	 * Start a timeout which, if we read the timeout time, will schedule a small amount of caching
	 * to be performed every frame. This timeout will be cancelled every time we perform background caching.
	 */
	scheduleTimeout() {
		this.cancelTimeout();
		this.cancelAnimationFrame();

		this.background.nextTimeoutId = window.setTimeout(
			() => {
				this.scheduleAnimationFrameCache();
				this.background.nextTimeoutId = null;
			},
			Cache.backgroundCachingTimeoutMillis
		);
	}

	/**
	 * Schedule a small amount of caching to be done just before the next frame renders
	 */
	scheduleAnimationFrameCache() {
		const latestCacheId = this.getLatestCacheId();
		if (latestCacheId) {
			this.background.nextAnimationFrameId = window.requestAnimationFrame(
				() => this.runAnimationCache(this.background.queues.get(latestCacheId))
			);
		}
	}

	/**
	 * Find which cache was last used and get its cache ID
	 */
	getLatestCacheId() {
		return Array.from(this.lastUsed.entries())
			.filter(entry => this.background.queues.get(entry[0]).hasNext())
			.sort((a, b) => b[1] - a[1])[0]?.[0];
	}

	/**
	 * Cache nodes for a short time, and then schedule another idle job to cache more nodes
	 */
	runBackgroundCache(queue) {
		const endTime = performance.now() + Cache.maxBackgroundCachingMillis;
		while (queue.hasNext() && performance.now() < endTime) {
			this.cacheNextNode(queue);
		}

		this.background.nextJobId = null;
		this.scheduleBackgroundCache();
	}

	/**
	 * Cache nodes for a very short time, then schedule to cache more nodes next frame
	 */
	runAnimationCache(queue) {
		const endTime = performance.now() + Cache.maxAnimationCachingMillis;
		while (queue.hasNext() && performance.now() < endTime) {
			this.cacheNextNode(queue);
		}

		this.background.nextAnimationFrameId = null;
		this.scheduleAnimationFrameCache();
	}

	cacheNextNode(queue) {
		let queueItem = queue.pop();
		const node = getNode(queueItem.value.pos, this.nodes.get(queueItem.cacheId), queueItem.token);
		for (let edge of node.edges) {
			queue.push(
				{
					value: {
						pos: {
							x: edge.target.x,
							y: edge.target.y
						}
					},
					cacheId: queueItem.cacheId,
					token: queueItem.token
				}
			);
		}
	}

	cancelTimeout() {
		if (this.background.nextTimeoutId) {
			window.clearTimeout(this.background.nextTimeoutId);
			this.background.nextTimeoutId = null;
		}
	}

	cancelAnimationFrame() {
		if (this.background.nextAnimationFrameId) {
			window.cancelAnimationFrame(this.background.nextAnimationFrameId);
			this.background.nextAnimationFrameId = null;
		}
	}
}

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
			pathfinder = GridlessPathfinding.initialize(canvas.walls.placeables, tokenSize, token.data.elevation, Boolean(game.modules.get("wall-height")?.active));
			gridlessPathfinders.set(tokenSize, pathfinder);
		}
		paintGridlessPathfindingDebug(pathfinder);
		return GridlessPathfinding.findPath(pathfinder, from, to);
	} else {
		const cachedNodes = cache.getCachedNodes(token);
		cache.startBackgroundCaching(token);
		const firstNode = calculatePath(from, to, cachedNodes, token, previousWaypoints);
		if (!firstNode)
			return null;
		paintGriddedPathfindingDebug(firstNode, token);
		const path = [];
		let currentNode = firstNode;
		while (currentNode) {
			// TODO Check if the distance doesn't change
			if (path.length >= 2 && !stepCollidesWithWall(path[path.length - 2], currentNode.node, token)) {
				// Replace last waypoint if the current waypoint leads to a valid path
				path[path.length - 1] = {x: currentNode.node.x, y: currentNode.node.y};
			} else {
				path.push({x: currentNode.node.x, y: currentNode.node.y});
			}
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
	const stepStart = getSnapPointForTokenObj(getPixelsFromGridPositionObj(from), token);
	const stepEnd = getSnapPointForTokenObj(getPixelsFromGridPositionObj(to), token);
	return canvas.walls.checkCollision(new Ray(stepStart, stepEnd));
}

export function wipePathfindingCache() {
	cache.clear();
	for (const pathfinder of gridlessPathfinders.values()) {
		GridlessPathfinding.free(pathfinder);
	}
	gridlessPathfinders.clear();
	if (debugGraphics)
		debugGraphics.removeChildren().forEach(c => c.destroy());
}

export function initializePathfinding() {
	gridWidth = Math.ceil(canvas.dimensions.width / canvas.grid.w);
	gridHeight = Math.ceil(canvas.dimensions.height / canvas.grid.h);
}

export function startBackgroundCaching(token) {
	if (game.user.isGM || game.settings.get(settingsKey, "allowPathfinding")) {
		cache.startBackgroundCaching(token);
	}
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
