import {getGridPositionFromPixelsObj, getPixelsFromGridPositionObj} from "./foundry_fixes.js";
import {moveWithoutAnimation, togglePathfinding} from "./keybindings.js";
import {debugGraphics} from "./main.js";
import {settingsKey} from "./settings.js";
import {getSnapPointForTokenObj, iterPairs} from "./util.js";

import * as GridlessPathfinding from "../wasm/gridless_pathfinding.js"

let cachedNodes = undefined;
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
			pathfinder = GridlessPathfinding.initialize(canvas.walls.placeables, tokenSize);
			gridlessPathfinders.set(tokenSize, pathfinder);
		}
		paintGridlessPathfindingDebug(pathfinder);
		return GridlessPathfinding.findPath(pathfinder, from, to);
	}
	else {
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
				path[path.length - 1] = {x: currentNode.node.x, y: currentNode.node.y};
			else
				path.push({x: currentNode.node.x, y: currentNode.node.y});
			currentNode = currentNode.previous;
		}
		return path;
	}
}

function getNode(pos, token, initialize = true) {
	pos = {layer: 0, ...pos}; // Copy pos and set pos.layer to the default value if it's unset
	if (!cachedNodes)
		cachedNodes = new Array(2);
	if (!cachedNodes[pos.layer])
		cachedNodes[pos.layer] = new Array(Math.ceil(canvas.dimensions.height / canvas.grid.h));
	if (!cachedNodes[pos.layer][pos.y])
		cachedNodes[pos.layer][pos.y] = new Array(Math.ceil(canvas.dimensions.width / canvas.grid.w));
	if (!cachedNodes[pos.layer][pos.y][pos.x]) {
		cachedNodes[pos.layer][pos.y][pos.x] = pos;
	}

	const node = cachedNodes[pos.layer][pos.y][pos.x];
	if (initialize && !node.edges) {
		node.edges = [];
		for (const neighborPos of canvas.grid.grid.getNeighbors(pos.y, pos.x).map(([y, x]) => {return {x, y};})) {
			if (neighborPos.x < 0 || neighborPos.y < 0 || neighborPos.x > gridWidth || neighborPos.y > gridHeight) {
				continue;
			}

			// TODO Work with pixels instead of grid locations
			if (!stepCollidesWithWall(pos, neighborPos, token)) {
				const isDiagonal = node.x !== neighborPos.x && node.y !== neighborPos.y && canvas.grid.type === CONST.GRID_TYPES.SQUARE;
				let targetLayer = pos.layer;
				if (use5105 && isDiagonal)
					targetLayer = 1 - targetLayer;
				const neighbor = getNode({...neighborPos, layer: targetLayer}, token, false);

				// TODO We currently assume a cost of one or two for all transitions. Change this for difficult terrain support
				let edgeCost = 1;
				if (isDiagonal) {
					// We charge 0.0001 more for edges to avoid unnecessary diagonal steps
					edgeCost = pos.layer === 1 && targetLayer === 0 ? 2 : 1.0001;
				}
				node.edges.push({target: neighbor, cost: edgeCost});
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
	const nextNodes = [{node: getNode({...to, layer: startLayer}, token), cost: 0, estimated: estimateCost(to, from), previous: null}];
	const previousNodes = new Set();
	while (nextNodes.length > 0) {
		// Sort by estimated cost, high to low
		// TODO Re-sorting every iteration is expensive. Think of something better
		nextNodes.sort((a, b) => b.estimated - a.estimated);
		// Get node with cheapest estimate
		const currentNode = nextNodes.pop();
		if (currentNode.node.x === from.x && currentNode.node.y === from.y)
			return currentNode;
		previousNodes.add(currentNode.node);
		for (const edge of currentNode.node.edges) {
			const neighborNode = getNode(edge.target, token);
			if (previousNodes.has(neighborNode))
				continue;
			const neighbor = {node: neighborNode, cost: currentNode.cost + edge.cost, estimated: currentNode.cost + edge.cost + estimateCost(neighborNode, from), previous: currentNode};
			const neighborIndex = nextNodes.findIndex(node => node.node === neighbor.node);
			if (neighborIndex >= 0) {
				// If the neighbor is cheaper to reach via the current route than through previously discovered routes, replace it
				if (nextNodes[neighborIndex].cost > neighbor.cost) {
					nextNodes[neighborIndex] = neighbor;
				}
			}
			else {
				nextNodes.push(neighbor);
			}
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
	return Math.max(Math.abs(pos.x - target.x), Math.abs(pos.y - target.y));
}

function stepCollidesWithWall(from, to, token) {
	const stepStart = getSnapPointForTokenObj(getPixelsFromGridPositionObj(from), token);
	const stepEnd = getSnapPointForTokenObj(getPixelsFromGridPositionObj(to), token);
	return canvas.walls.checkCollision(new Ray(stepStart, stepEnd));
}

export function wipePathfindingCache() {
	cachedNodes = undefined;
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
