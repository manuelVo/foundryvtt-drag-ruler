import {getCenterFromGridPositionObj, getGridPositionFromPixelsObj, getPixelsFromGridPositionObj} from "./foundry_fixes.js";
import {moveWithoutAnimation, togglePathfinding} from "./keybindings.js";
import {debugGraphics} from "./main.js";
import {settingsKey} from "./settings.js";
import {getSnapPointForTokenObj, getTokenShape, getTokenShapeId, iterPairs} from "./util.js";

import * as GridlessPathfinding from "../wasm/gridless_pathfinding.js";
import {PriorityQueueSet} from "./data_structures.js";
import { buildCostFunction } from "./api.js";
import { measure } from "./foundry_imports.js";

class Cache {
	static maxCacheIds = 5;

	constructor() {
		this.nodes = new Map();
		this.lastUsed = new Map();
	}

	clear() {
		this.nodes.clear();
		this.lastUsed.clear();
	}

	/**
	 * Get the cache associated with the given cache ID, creating a new one
	 * if we don't already have one
	 */
	getCachedNodes(cacheId) {
		// Track that we've last used this cache right now
		this.lastUsed.set(cacheId, Date.now());

		// Get the nodes for the cacheId. If we don't already have one, create one
		let cachedNodes = this.nodes.get(cacheId);
		if (!cachedNodes) {
			cachedNodes = new Array(gridHeight);
			for (let y = 0; y < gridHeight; y++) {
				cachedNodes[y] = new Array(gridWidth);
				for (let x = 0; x < gridWidth; x++) {
					cachedNodes[y][x] = {x, y};
				}
			}
			this.nodes.set(cacheId, cachedNodes);

			// Since we're adding a new cache, check if we have too many and,
			// if we do, get rid of the one that was last used longest ago
			if (this.lastUsed.size > Cache.maxCacheIds) {
				let oldest;
				for (let entry of this.lastUsed) {
					if (!oldest || oldest[1] > entry[1]) {
						oldest = entry;
					}
				}
				this.nodes.delete(oldest[0]);
				this.lastUsed.delete(oldest[0]);
			}
		}

		return cachedNodes;
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
			pathfinder = GridlessPathfinding.initialize(canvas.walls.placeables, tokenSize, token.data.elevation, Boolean(game.modules.get("levels")?.active));
			gridlessPathfinders.set(tokenSize, pathfinder);
		}
		paintGridlessPathfindingDebug(pathfinder);
		return GridlessPathfinding.findPath(pathfinder, from, to);
	} else {
		const cachedNodes = getCachedNodes(token);
		const lastNode = calculatePath(from, to, cachedNodes, token, previousWaypoints);
		if (!lastNode)
			return null;
		paintGriddedPathfindingDebug(lastNode, token);
		const path = [];
		let currentNode = lastNode;
		while (currentNode) {
			if (path.length >= 2 && !stepCollidesWithWall(path[path.length - 2], currentNode.node, token)) {
				// Replace last waypoint if the current waypoint leads to a valid path that isn't longer than the old path
				if (window.terrainRuler) {
					let startNode = getCenterFromGridPositionObj(path[path.length - 2]);
					let middleNode = getCenterFromGridPositionObj(path[path.length - 1]);
					let endNode = getCenterFromGridPositionObj(currentNode.node);
					let oldPath = [{ray: new Ray(startNode, middleNode)}, {ray: new Ray(middleNode, endNode)}];
					let newPath = [{ray: new Ray(startNode, endNode)}];
					let costFunction = buildCostFunction(token, getTokenShape(token));
					// TODO Cache the used measurement for use in the next loop to improve performance
					let oldDistance = terrainRuler.measureDistances(oldPath, {costFunction}).reduce((a, b) => a + b);
					let newDistance = terrainRuler.measureDistances(newPath, {costFunction})[0];

					// TODO We might need to check if the diagonal count has increased on 5-10-5
					if (newDistance < oldDistance)  {
						path.pop();
					}
					else if (newDistance === oldDistance) {
						let oldNoDiagonals = oldPath[1].ray.terrainRulerFinalState?.noDiagonals;
						let newNoDiagonals = newPath[0].ray.terrainRulerFinalState?.noDiagonals;
						// This uses === && < instead of <= because the variables might be undefined (which shall lead to a true result)
						if (oldNoDiagonals === newNoDiagonals || newNoDiagonals < oldNoDiagonals) {
							path.pop();
						}
					}
				}
				else {
					path.pop();
				}
			}
			path.push({x: currentNode.node.x, y: currentNode.node.y});
			currentNode = currentNode.previous;
		}
		return path;
	}
}

/**
 * Build a cache ID based on the current token's data and then retrieve the cache to use from that
 */
function getCachedNodes(token) {
	const cacheData = {};

	// Different-sized tokens snap to different points on the grid,
	// so they might follow a different path to other tokens
	cacheData.tokenShape = getTokenShapeId(token);

	// If levels is enabled, the token's elevation can affect which walls
	// they need to worry about
	if (game.modules.get("levels")?.active) {
		cacheData.elevation = token.data.elevation;
	}

	const cacheId = JSON.stringify(cacheData);
	return cache.getCachedNodes(cacheId);
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
			if (!stepCollidesWithWall(neighborPos, pos, token)) {
				const isDiagonal = node.x !== neighborPos.x && node.y !== neighborPos.y && canvas.grid.type === CONST.GRID_TYPES.SQUARE;
				let edgeCost;
				if (window.terrainRuler) {
					let ray = new Ray(getCenterFromGridPositionObj(neighborPos), getCenterFromGridPositionObj(pos));
					let measuredDistance = terrainRuler.measureDistances([{ray}], {costFunction: buildCostFunction(token, getTokenShape(token))})[0];
					edgeCost = Math.round(measuredDistance / canvas.dimensions.distance);
					if (ray.terrainRulerFinalState?.noDiagonals === 1) {
						edgeCost = 1.5;
					}
					// Charge 1.0001 instead of 1 for diagonals to discourage unnecessary diagonals
					if (isDiagonal && edgeCost == 1) {
						edgeCost = 1.0001;
					}
				}
				else {
					// Count 5-10-5 diagonals as 1.5 (so two add up to 3) and 5-5-5 diagonals as 1.0001 (to discourage unnecessary diagonals)
					// TODO Account for difficult terrain
					edgeCost = isDiagonal ? (use5105 ? 1.5 : 1.0001) : 1;
				}
				const neighbor = getNode(neighborPos, cachedNodes, token, false);
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
			node: getNode(to, cachedNodes, token),
			cost: startCost,
			estimated: startCost + estimateCost(to, from),
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
			const neighborNode = getNode(edge.target, cachedNodes, token);
			if (previousNodes.has(neighborNode)) {
				continue;
			}

			const neighbor = {
				node: neighborNode,
				cost: currentNode.cost + edge.cost,
				estimated: currentNode.cost + edge.cost + estimateCost(neighborNode, from),
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
