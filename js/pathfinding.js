import { getGridPositionFromPixelsObj, getPixelsFromGridPositionObj } from "./foundry_fixes.js";
import { moveWithoutAnimation, togglePathfinding } from "./keybindings.js";
import { debugGraphics } from "./main.js";
import { settingsKey } from "./settings.js";
import { getSnapPointForTokenObj, iterPairs } from "./util.js";
import { UniquePriorityQueue, ProcessOnceQueue } from "./queues.js";

import * as GridlessPathfinding from "../wasm/gridless_pathfinding.js"

const maxIterationNodesCached = 100;
let backgroundCacheQueue = undefined;
let iterationNodesCached = 0;

let cachedNodes = undefined;
let use5105 = false;
let gridlessPathfinders = new Map();
let gridWidth, gridHeight;
let lastElevation;

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
	// If levels is enabled, we need to clear the Pathfinding cache whenever we change height because the walls might be different
	if (game.modules.get("levels")?.active) {
		const tokenElevation = token.data.elevation;
		if (tokenElevation != lastElevation) {
			lastElevation = tokenElevation;
			wipePathfindingCache();
		}
	}
	iterationNodesCached = 0;
	startBackgroundInitialiseCache(token);

	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		let tokenSize = Math.max(token.data.width, token.data.height) * canvas.dimensions.size;
		let pathfinder = gridlessPathfinders.get(tokenSize);
		if (!pathfinder) {
			pathfinder = GridlessPathfinding.initialize(canvas.walls.placeables, tokenSize);
			gridlessPathfinders.set(tokenSize, pathfinder);
		}
		paintGridlessPathfindingDebug(pathfinder);
		return GridlessPathfinding.findPath(pathfinder, from, to);
	} else {
		const lastNode = calculatePath(from, to, token, previousWaypoints);
		if (!lastNode)
			return null;
		paintGriddedPathfindingDebug(lastNode, token);
		const path = [];
		let currentNode = lastNode;
		while (currentNode) {
			// TODO Check if the distance doesn't change
			if (path.length >= 2 && !stepCollidesWithWall(currentNode.node, path[path.length - 2], token))
				// Replace last waypoint if the current waypoint leads to a valid path
				path[path.length - 1] = { x: currentNode.node.x, y: currentNode.node.y };
			else
				path.push({ x: currentNode.node.x, y: currentNode.node.y });
			currentNode = currentNode.previous;
		}
		return path;
	}
}

export function wipePathfindingCache() {
	cachedNodes = undefined;
	backgroundCacheQueue = undefined;

	for (const pathfinder of gridlessPathfinders.values()) {
		GridlessPathfinding.free(pathfinder);
	}
	gridlessPathfinders.clear();
	if (debugGraphics)
		debugGraphics.removeChildren().forEach(c => c.destroy());
}

export function initialisePathfinding() {
	gridWidth = Math.ceil(canvas.dimensions.width / canvas.grid.w);
	gridHeight = Math.ceil(canvas.dimensions.height / canvas.grid.h);
}

function startBackgroundInitialiseCache(token) {
	if (!backgroundCacheQueue) {
		backgroundCacheQueue = new ProcessOnceQueue();

		const tokenPos = getGridPositionFromPixelsObj(token.position);
		
		backgroundCacheQueue.push(getNode(tokenPos, token, false));
		window.requestIdleCallback(() => backgroundInitialiseCache(token));
	}
}

function backgroundInitialiseCache(token) {
	iterationNodesCached = 0;
	let backgroundNodesCached = 0;

	while (backgroundCacheQueue.hasNext() && backgroundNodesCached < 10) {
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
		window.requestIdleCallback(() => backgroundInitialiseCache(token));
	} else {
		console.log("Done initialising nodes!!")
	}
}

function getNode(pos, token, initialize = true) {
	pos = { layer: 0, ...pos }; // Copy pos and set pos.layer to the default value if it's unset
	if (!cachedNodes)
		cachedNodes = new Array(2);
	if (!cachedNodes[pos.layer])
		cachedNodes[pos.layer] = new Array(gridHeight);
	if (!cachedNodes[pos.layer][pos.y])
		cachedNodes[pos.layer][pos.y] = new Array(gridWidth);
	if (!cachedNodes[pos.layer][pos.y][pos.x]) {
		cachedNodes[pos.layer][pos.y][pos.x] = pos;
	}

	const node = cachedNodes[pos.layer][pos.y][pos.x];
	if (initialize && !node.edges) {
		if (iterationNodesCached >= maxIterationNodesCached) return;
		iterationNodesCached++;

		node.edges = [];
		for (const neighborPos of canvas.grid.grid.getNeighbors(pos.y, pos.x).map(([y, x]) => { return { x, y }; })) {
			if (neighborPos.x < 0 || neighborPos.y < 0 || neighborPos.x > gridWidth || neighborPos.y > gridHeight) {
				continue;
			}

			// TODO Work with pixels instead of grid locations
			if (!stepCollidesWithWall(pos, neighborPos, token)) {
				const isDiagonal = node.x !== neighborPos.x && node.y !== neighborPos.y && canvas.grid.type === CONST.GRID_TYPES.SQUARE;
				let targetLayer = pos.layer;
				if (use5105 && isDiagonal)
					targetLayer = 1 - targetLayer;
				const neighbor = getNode({ ...neighborPos, layer: targetLayer }, token, false);

				// TODO We currently assume a cost of one or two for all transitions. Change this for difficult terrain support
				let edgeCost = 1;
				if (isDiagonal) {
					// We charge 0.0001 more for edges to avoid unnecessary diagonal steps
					edgeCost = pos.layer === 1 && targetLayer === 0 ? 2 : 1.0001;
				}
				node.edges.push({ target: neighbor, cost: edgeCost })
			}
		}
	}
	return node;
}

function calculatePath(from, to, token, previousWaypoints) {
	if (game.system.id === "pf2e")
		use5105 = true;
	if (canvas.grid.diagonalRule === "5105")
		use5105 = true;
	let startLayer = 0;
	if (use5105 && canvas.grid.type === CONST.GRID_TYPES.SQUARE) {
		previousWaypoints = previousWaypoints.map(w => getGridPositionFromPixelsObj(w));
		startLayer = calcNoDiagonals(previousWaypoints) % 2;
	}

	const nextNodes = new UniquePriorityQueue((node1, node2) => node1.node === node2.node);
	nextNodes.push(
		{
			node: getNode({ ...to, layer: startLayer }, token),
			cost: 0,
			estimated: estimateCost(to, from),
			previous: null
		},
		0
	);
	const previousNodes = new Set();
	while (nextNodes.hasNext()) {
		// Get node with cheapest estimate
		const currentNode = nextNodes.pop();
		if (currentNode.node.x === from.x && currentNode.node.y === from.y)
			return currentNode;
		previousNodes.add(currentNode.node);
		for (const edge of currentNode.node.edges) {
			const neighborNode = getNode(edge.target, token);
			if (!neighborNode) {
				return;
			}
			if (previousNodes.has(neighborNode))
				continue;
			const neighbor = { node: neighborNode, cost: currentNode.cost + edge.cost, estimated: currentNode.cost + edge.cost + estimateCost(neighborNode, from), previous: currentNode };
			nextNodes.push(neighbor, neighbor.cost);
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

function estimateCost(pos, target) {
	const distX = Math.abs(pos.x - target.x);
	const distY = Math.abs(pos.y - target.y);
	return Math.max(distX, distY) + use5105 ? Math.floor(Math.min(distX, distY) * 0.5) : 0;
}

function stepCollidesWithWall(from, to, token) {
	const stepStart = getSnapPointForTokenObj(getPixelsFromGridPositionObj(from), token);
	const stepEnd = getSnapPointForTokenObj(getPixelsFromGridPositionObj(to), token);
	return canvas.walls.checkCollision(new Ray(stepStart, stepEnd));
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
