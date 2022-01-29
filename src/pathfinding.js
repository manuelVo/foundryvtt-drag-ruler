import {getCenterFromGridPositionObj} from "./foundry_fixes.js";
import {togglePathfinding} from "./keybindings.js";
import {settingsKey} from "./settings.js";

let cachedNodes = undefined;
let use5105 = false;

export function isPathfindingEnabled() {
	if (canvas.grid.type !== CONST.GRID_TYPES.SQUARE)
		return false;
	if (!game.settings.get(settingsKey, "allowPathfinding"))
		return false;
	return game.settings.get(settingsKey, "autoPathfinding") != togglePathfinding;
}

export function findPath(from, to) {
	const lastNode = calculatePath(from, to);
	if (!lastNode)
		return null;
	const path = [];
	let currentNode = lastNode;
	while (currentNode) {
		// TODO Check if the distance doesn't change
		if (path.length >= 2 && !canvas.walls.checkCollision(new Ray(getCenterFromGridPositionObj(currentNode.node), getCenterFromGridPositionObj(path[path.length - 2]))))
			// Replace last waypoint if the current waypoint leads to a valid path
			path[path.length - 1] = {x: currentNode.node.x, y: currentNode.node.y};
		else
			path.push({x: currentNode.node.x, y: currentNode.node.y});
		currentNode = currentNode.previous;
	}
	return path;
}

export function wipePathfindingCache() {
	cachedNodes = undefined;
}

function getNode(pos, layer=0, initialize=true) {
	if (!cachedNodes)
		cachedNodes = new Map();
	let cachedLayer = cachedNodes.get(layer);
	if (!cachedLayer) {
		// TODO Check if ceil is the right thing to do here
		cachedLayer = new Array(Math.ceil(canvas.dimensions.sceneHeight / canvas.dimensions.size));
		cachedNodes.set(layer, cachedLayer);
	}
	if (!cachedLayer[pos.y])
		cachedLayer[pos.y] = new Array(Math.ceil(canvas.dimensions.sceneWidth / canvas.dimensions.size));
	if (!cachedLayer[pos.y][pos.x]) {
		cachedLayer[pos.y][pos.x] = {x: pos.x, y: pos.y, layer: layer};
	}

	const node = cachedLayer[pos.y][pos.x];
	if (initialize && !node.edges) {
		node.edges = [];
		for (const neighborPos of neighbors(pos)) {
			// TODO Work with pixels instead of grid locations
			if (!canvas.walls.checkCollision(new Ray(getCenterFromGridPositionObj(pos), getCenterFromGridPositionObj(neighborPos)))) {
				const isDiagonal = node.x !== neighborPos.x && node.y !== neighborPos.y;
				let targetLayer = layer;
				if (use5105 && isDiagonal)
					targetLayer = 1 - targetLayer;
				const neighbor = getNode(neighborPos, targetLayer, false);
				// TODO We currently assume a cost of one for all transitions. Change this for 5/10/5 or difficult terrain support

				let edgeCost = 1;
				if (isDiagonal) {
					// We charge 0.0001 more for edges to avoid unnecessary diagonal steps
					edgeCost = layer === 0 ? 1.0001 : 2;
				}
				node.edges.push({target: neighbor, cost: edgeCost});
			}
		}
	}
	return node;
}

function* neighbors(pos) {
	for (let y = -1;y < 2;y++) {
		for (let x = -1;x < 2;x++) {
			if (x != 0 || y != 0)
				yield {x: pos.x + x, y: pos.y + y};
		}
	}
}

function calculatePath(from, to) {
	if (game.system.id === "pf2e")
		use5105 = true;
	if (canvas.grid.diagonalRule === "5105")
		use5105 = true;
	// On 5/10/5 it's possible that we'd need to start on layer 1 if there is a previous route
	// However I cannot think of any case where not doing it would lead to a non-optimal path, so I've ommited that
	const nextNodes = [{node: getNode(to), cost: 0, estimated: estimateCost(to, from), previous: null}];
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
			const neighborNode = getNode(edge.target);
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

function estimateCost(pos, target) {
	return Math.max(Math.abs(pos.x - target.x), Math.abs(pos.y - target.y));
}
