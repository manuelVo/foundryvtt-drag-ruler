import {
	getCenterFromGridPositionObj,
	getGridPositionFromPixelsObj,
	getPixelsFromGridPositionObj,
} from "./foundry_fixes.js";
import {moveWithoutAnimation, togglePathfinding} from "./keybindings.js";
import {debugGraphics} from "./main.js";
import {settingsKey} from "./settings.js";
import {
	buildSnapPointTokenData,
	getSnapPointForTokenDataObj,
	getTokenShape,
	getTokenShapeForTokenData,
	isModuleActive,
	iterPairs,
} from "./util.js";

import * as GridlessPathfinding from "../wasm/gridless_pathfinding.js";
import {PriorityQueueSet, ProcessOnceQueue} from "./data_structures.js";
import {buildCostFunction} from "./api.js";

class CacheLayer {
	constructor(tokenData, cacheId) {
		this.tokenData = tokenData;
		this.cacheId = cacheId;
		this.queue = new ProcessOnceQueue();

		this.buildNodes();
		this.registerUse();
	}

	buildNodes() {
		this.nodes = new Array(gridHeight);
		for (let y = 0; y < gridHeight; y++) {
			this.nodes[y] = new Array(gridWidth);
			for (let x = 0; x < gridWidth; x++) {
				this.nodes[y][x] = {x, y};
			}
		}
	}

	registerUse() {
		this.lastUsed = Date.now();
	}
}

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
	static maxCacheLayers = 5;
	static maxBackgroundCachingMillis = 10;
	static maxAnimationCachingMillis = 5;
	static backgroundCachingTimeoutMillis = 200;

	constructor() {
		this.layers = new Map();
		this.background = {
			nextJobId: null,
			nextTimeoutId: null,
			nextAnimationFrameId: null,
		};
	}

	clear() {
		this.layers.clear();
		if (this.background.nextJobId) {
			window.cancelIdleCallback(this.background.nextJobId);
			this.background.nextJobId = null;
		}
		this.cancelTimeout();
		this.cancelAnimationFrame();
	}

	/**
	 * Retrieve the cache layer for this token, using information that can make a difference to the pathfinding algorithm
	 * If a layer that suits this token doesn't exist, create one
	 */
	getCacheLayer(token) {
		const tokenData = buildTokenData(token);
		// TODO Request this from the speed providers so they can set their own options
		let terrainData = canvas.terrain.listAllTerrain({token});
		terrainData = terrainData.map(data => {
			return {
				x: data.object.x,
				y: data.object.y,
				cost: data.cost,
				shape: data.shape,
			};
		});
		const cacheIdData = {tokenData, terrainData};
		const cacheId = GridlessPathfinding.sha1(JSON.stringify(cacheIdData));
		let cacheLayer = this.layers.get(cacheId);
		// If we don't already have a cache layer for this cache ID, create one now
		if (!cacheLayer) {
			// Check if we already have the max number of layers. If we do,
			// get rid of the one that hasn't been used for the longest
			if (this.layers.size >= Cache.maxCacheLayers) {
				const oldestCache = Array.from(this.layers.values()).reduce(
					(layer1, layer2) => (layer1?.lastUsed < layer2.lastUsed ? layer1 : layer2),
					null,
				);
				this.layers.delete(oldestCache.cacheId);
			}

			// Create the new cache
			cacheLayer = new CacheLayer(tokenData, cacheId);
			this.layers.set(cacheId, cacheLayer);
		} else {
			// Register that we're using this cache right now
			cacheLayer.registerUse();
		}

		return cacheLayer;
	}

	/**
	 * Start background caching from the token's current position
	 */
	startBackgroundCaching(token) {
		const cacheLayer = this.getCacheLayer(token);
		const tokenPosition = getGridPositionFromPixelsObj(token.position);

		cacheLayer.queue.push(cacheLayer.nodes[tokenPosition.y][tokenPosition.x]);

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
		const latestCache = this.getLatestCacheWithNonEmptyQueue();
		if (latestCache) {
			this.background.nextJobId = window.requestIdleCallback(() =>
				this.runBackgroundCache(latestCache),
			);
			this.resetAnimationFrameTimeout();
		}
	}

	/**
	 * Start a timeout which, if we reach the timeout time, will schedule a small amount of caching
	 * to be performed every frame. This timeout will be reset every time we perform background caching.
	 */
	resetAnimationFrameTimeout() {
		this.cancelTimeout();
		this.cancelAnimationFrame();

		this.background.nextTimeoutId = window.setTimeout(() => {
			this.scheduleAnimationFrameCache();
			this.background.nextTimeoutId = null;
		}, Cache.backgroundCachingTimeoutMillis);
	}

	/**
	 * Schedule a small amount of caching to be done just before the next frame renders
	 */
	scheduleAnimationFrameCache() {
		const latestCache = this.getLatestCacheWithNonEmptyQueue();
		if (latestCache) {
			this.background.nextAnimationFrameId = window.requestAnimationFrame(() =>
				this.runAnimationCache(latestCache),
			);
		}
	}

	/**
	 * Find which cache was last used and get its cache ID
	 */
	getLatestCacheWithNonEmptyQueue() {
		return Array.from(this.layers.values())
			.filter(layer => layer.queue.hasNext())
			.reduce((layer1, layer2) => (layer1?.lastUsed > layer2.lastUsed ? layer1 : layer2), null);
	}

	/**
	 * Cache nodes for a short time, and then schedule another idle job to cache more nodes
	 */
	runBackgroundCache(cacheLayer) {
		const endTime = performance.now() + Cache.maxBackgroundCachingMillis;
		while (cacheLayer.queue.hasNext() && performance.now() < endTime) {
			this.cacheNextNode(cacheLayer);
		}

		this.background.nextJobId = null;
		this.scheduleBackgroundCache();
	}

	/**
	 * Cache nodes for a very short time, then schedule to cache more nodes next frame
	 */
	runAnimationCache(cacheLayer) {
		const endTime = performance.now() + Cache.maxAnimationCachingMillis;
		while (cacheLayer.queue.hasNext() && performance.now() < endTime) {
			this.cacheNextNode(cacheLayer);
		}

		this.background.nextAnimationFrameId = null;
		this.scheduleAnimationFrameCache();
	}

	cacheNextNode(cacheLayer) {
		let node = cacheLayer.queue.pop();
		getNode(node, cacheLayer);
		for (let edge of node.edges) {
			cacheLayer.queue.push(edge.target);
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
	if (this.user !== game.user) return false;
	if (!game.user.isGM && !game.settings.get(settingsKey, "allowPathfinding")) return false;
	if (moveWithoutAnimation) return false;
	return game.settings.get(settingsKey, "autoPathfinding") != togglePathfinding;
}

export function findPath(from, to, token, previousWaypoints) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		let tokenSize = Math.max(token.data.width, token.data.height) * canvas.dimensions.size;
		let pathfinder = gridlessPathfinders.get(tokenSize);
		if (!pathfinder) {
			let radiusMultiplier = game.settings.get(settingsKey, "pathfindingRadius");
			pathfinder = GridlessPathfinding.initialize(
				canvas.walls.placeables,
				tokenSize * radiusMultiplier,
				token.data.elevation,
				Boolean(game.modules.get("wall-height")?.active),
			);
			gridlessPathfinders.set(tokenSize, pathfinder);
		}
		paintGridlessPathfindingDebug(pathfinder);
		return GridlessPathfinding.findPath(pathfinder, from, to);
	} else {
		const cacheLayer = cache.getCacheLayer(token);
		const firstNode = calculatePath(from, to, cacheLayer, previousWaypoints);
		if (!firstNode) return null;
		paintGriddedPathfindingDebug(firstNode, cacheLayer.tokenData);
		const path = [];
		let currentNode = firstNode;
		while (currentNode) {
			if (
				path.length >= 2 &&
				!stepCollidesWithWall(path[path.length - 2], currentNode.node, cacheLayer.tokenData)
			) {
				// Replace last waypoint if the current waypoint leads to a valid path that isn't longer than the old path
				if (window.terrainRuler) {
					let startNode = getCenterFromGridPositionObj(path[path.length - 2]);
					let middleNode = getCenterFromGridPositionObj(path[path.length - 1]);
					let endNode = getCenterFromGridPositionObj(currentNode.node);
					let oldPath = [
						{ray: new Ray(startNode, middleNode)},
						{ray: new Ray(middleNode, endNode)},
					];
					let newPath = [{ray: new Ray(startNode, endNode)}];
					let costFunction = buildCostFunction(token, getTokenShape(token));
					// TODO Cache the used measurement for use in the next loop to improve performance
					let oldDistance = terrainRuler
						.measureDistances(oldPath, {costFunction})
						.reduce((a, b) => a + b);
					let newDistance = terrainRuler.measureDistances(newPath, {costFunction})[0];

					// TODO We might need to check if the diagonal count has increased on 5-10-5
					if (newDistance < oldDistance) {
						path.pop();
					} else if (newDistance === oldDistance) {
						let oldNoDiagonals = oldPath[1].ray.terrainRulerFinalState?.noDiagonals;
						let newNoDiagonals = newPath[0].ray.terrainRulerFinalState?.noDiagonals;
						// This uses === && < instead of <= because the variables might be undefined (which shall lead to a true result)
						if (oldNoDiagonals === newNoDiagonals || newNoDiagonals < oldNoDiagonals) {
							path.pop();
						}
					}
				} else {
					path.pop();
				}
			}
			path.push({x: currentNode.node.x, y: currentNode.node.y});
			currentNode = currentNode.next;
		}
		return path;
	}
}

function buildTokenData(token) {
	// Almost all the information we need is for calculating the snap point
	const tokenData = buildSnapPointTokenData(token);

	// If Wall Height is enabled, which walls matter depends on the token's elevation.
	// Depending on the settings in Wall Height, the height we care about is either their
	// foot height (elevation) or eye height (losHeight).
	if (isModuleActive("wall-height")) {
		const blockSightMovement = game.settings.get("wall-height", "blockSightMovement");
		tokenData.elevation = blockSightMovement ? token.losHeight : token.data.elevation;
	}

	return tokenData;
}

function getNode(pos, cacheLayer, initialize = true) {
	const node = cacheLayer.nodes[pos.y][pos.x];
	if (initialize && !node.edges) {
		node.edges = [];
		for (const neighborPos of canvas.grid.grid.getNeighbors(pos.y, pos.x).map(([y, x]) => {
			return {x, y};
		})) {
			if (
				neighborPos.x < 0 ||
				neighborPos.y < 0 ||
				neighborPos.x >= gridWidth ||
				neighborPos.y >= gridHeight
			) {
				continue;
			}

			// TODO Work with pixels instead of grid locations
			if (!stepCollidesWithWall(pos, neighborPos, cacheLayer.tokenData)) {
				const isDiagonal =
					node.x !== neighborPos.x &&
					node.y !== neighborPos.y &&
					canvas.grid.type === CONST.GRID_TYPES.SQUARE;
				let edgeCost;
				if (window.terrainRuler) {
					let ray = new Ray(
						getCenterFromGridPositionObj(pos),
						getCenterFromGridPositionObj(neighborPos),
					);
					let measuredDistance = terrainRuler.measureDistances([{ray}], {
						costFunction: buildCostFunction(
							cacheLayer.tokenData,
							getTokenShapeForTokenData(cacheLayer.tokenData),
						),
					})[0];
					edgeCost = Math.round(measuredDistance / canvas.dimensions.distance);
					if (ray.terrainRulerFinalState?.noDiagonals === 1) {
						edgeCost = 1.5;
					}
					// Charge 1.0001 instead of 1 for diagonals to discourage unnecessary diagonals
					if (isDiagonal && edgeCost == 1) {
						edgeCost = 1.0001;
					}
				} else {
					// Count 5-10-5 diagonals as 1.5 (so two add up to 3) and 5-5-5 diagonals as 1.0001 (to discourage unnecessary diagonals)
					// TODO Account for difficult terrain
					edgeCost = isDiagonal ? (use5105 ? 1.5 : 1.0001) : 1;
				}
				const neighbor = getNode(neighborPos, cacheLayer, false);
				node.edges.push({target: neighbor, cost: edgeCost});
			}
		}
	}
	return node;
}

function calculatePath(from, to, cacheLayer, previousWaypoints) {
	use5105 = game.system.id === "pf2e" || canvas.grid.diagonalRule === "5105";
	let startCost = 0;
	if (use5105 && canvas.grid.type === CONST.GRID_TYPES.SQUARE) {
		previousWaypoints = previousWaypoints.map(w => getGridPositionFromPixelsObj(w));
		startCost = (calcNoDiagonals(previousWaypoints) % 2) * 0.5;
	}

	const nextNodes = new PriorityQueueSet(
		(node1, node2) => node1.node === node2.node,
		node => node.estimated,
	);
	const previousNodes = new Set();

	nextNodes.pushWithPriority({
		node: getNode(from, cacheLayer),
		cost: startCost,
		estimated: startCost + estimateCost(from, to),
		previous: null,
	});

	while (nextNodes.hasNext()) {
		// Get node with cheapest estimate
		const currentNode = nextNodes.pop();
		if (currentNode.node.x === to.x && currentNode.node.y === to.y) {
			return buildPathNodes(currentNode);
		}
		previousNodes.add(currentNode.node);
		for (const edge of currentNode.node.edges) {
			const neighborNode = getNode(edge.target, cacheLayer);
			if (previousNodes.has(neighborNode)) {
				continue;
			}

			const neighbor = {
				node: neighborNode,
				cost: currentNode.cost + edge.cost,
				estimated: currentNode.cost + edge.cost + estimateCost(neighborNode, to),
				previous: currentNode,
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
			next: previousNode,
		};
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

function stepCollidesWithWall(from, to, tokenData) {
	const stepStart = getSnapPointForTokenDataObj(getPixelsFromGridPositionObj(from), tokenData);
	const stepEnd = getSnapPointForTokenDataObj(getPixelsFromGridPositionObj(to), tokenData);
	if (isModuleActive("levels")) {
		stepStart.z = tokenData.elevation;
		stepEnd.z = tokenData.elevation;
		return _levels.testCollision(stepStart, stepEnd, "collision");
	} else {
		return canvas.walls.checkCollision(new Ray(stepStart, stepEnd));
	}
}

export function wipePathfindingCache() {
	cache.clear();
	for (const pathfinder of gridlessPathfinders.values()) {
		GridlessPathfinding.free(pathfinder);
	}
	gridlessPathfinders.clear();
	if (debugGraphics) debugGraphics.removeChildren().forEach(c => c.destroy());
}

export function initializePathfinding() {
	gridWidth = Math.ceil(canvas.dimensions.width / canvas.grid.w);
	gridHeight = Math.ceil(canvas.dimensions.height / canvas.grid.h);
}

export function startBackgroundCaching(token) {
	// Background caching isn't yet supported for gridless scenes
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return;
	if (game.user.isGM || game.settings.get(settingsKey, "allowPathfinding")) {
		cache.startBackgroundCaching(token);
	}
}

function paintGriddedPathfindingDebug(firstNode, tokenData) {
	if (!CONFIG.debug.dragRuler) return;

	debugGraphics.removeChildren().forEach(c => c.destroy());
	let currentNode = firstNode;
	while (currentNode) {
		let text = new PIXI.Text(currentNode.cost.toFixed(1));
		let pixels = getSnapPointForTokenDataObj(
			getPixelsFromGridPositionObj(currentNode.node),
			tokenData,
		);
		text.anchor.set(0.5, 1.0);
		text.x = pixels.x;
		text.y = pixels.y;
		debugGraphics.addChild(text);
		currentNode = currentNode.next;
	}
}

function paintGridlessPathfindingDebug(pathfinder) {
	if (!CONFIG.debug.dragRuler) return;

	debugGraphics.removeChildren().forEach(c => c.destroy());
	let graphic = new PIXI.Graphics();
	graphic.lineStyle(2, 0x440000);
	for (const point of GridlessPathfinding.debugGetPathfindingPoints(pathfinder)) {
		graphic.drawCircle(point.x, point.y, 5);
	}
	debugGraphics.addChild(graphic);
}
