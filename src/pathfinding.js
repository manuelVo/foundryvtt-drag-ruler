import {getCenterFromGridPositionObj} from "./foundry_fixes.js";
import {togglePathfinding} from "./keybindings.js";
import {settingsKey} from "./settings.js";

// TODO Wipe cache if walls layer is being modified
let cachedNodes = undefined;

export function isPathfindingEnabled() {
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
	if (!cachedNodes[layer])
		// TODO Check if ceil is the right thing to do here
		cachedNodes.set(layer, new Array(Math.ceil(canvas.dimensions.sceneHeight / canvas.dimensions.size)));
	if (!cachedNodes[layer][pos.y])
		cachedNodes[layer][pos.y] = new Array(Math.ceil(canvas.dimensions.sceneWidth / canvas.dimensions.size));
	if (!cachedNodes[layer][pos.y][pos.x]) {
		cachedNodes[layer][pos.y][pos.x] = {x: pos.x, y: pos.y, layer: layer};
	}

	const node = cachedNodes[layer][pos.y][pos.x];
	if (initialize && !node.edges) {
		node.edges = [];
		for (const neighborPos of neighbors(pos)) {
			// TODO Work with pixels instead of grid locations
			if (!canvas.walls.checkCollision(new Ray(getCenterFromGridPositionObj(pos), getCenterFromGridPositionObj(neighborPos)))) {
				const neighbor = getNode(neighborPos, layer, false);
				// TODO We currently assume a cost of one for all transitions. Change this for 5/10/5 or difficult terrain support
				// We charge an extra 0.0001 for diagonals to unnecessary diagonal steps
				const isDiagonal = node.x !== neighborPos.x && node.y !== neighborPos.y;
				const edgeCost = isDiagonal ? 1.0001 : 1;
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
