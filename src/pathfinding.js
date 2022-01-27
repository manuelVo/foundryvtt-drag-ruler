import {getCenterFromGridPositionObj} from "./foundry_fixes.js";
import {settingsKey} from "./settings.js";

// TODO Wipe cache if walls layer is being modified
let cached_nodes = undefined;

export function is_pathfinding_enabled() {
	if (!game.settings.get(settingsKey, "allowPathfinding"))
		return false;
	return game.settings.get(settingsKey, "autoPathfinding") != game.keyboard.isDown("y")
}

function get_node(pos, initialize=true) {
	if (!cached_nodes)
		// TODO Check if ceil is the right thing to do here
		cached_nodes = new Array(Math.ceil(canvas.dimensions.sceneHeight / canvas.dimensions.size));
	if (!cached_nodes[pos.y])
		cached_nodes[pos.y] = new Array(Math.ceil(canvas.dimensions.sceneWidth / canvas.dimensions.size));
	if (!cached_nodes[pos.y][pos.x]) {
		cached_nodes[pos.y][pos.x] = {x: pos.x, y: pos.y};
	}

	const node = cached_nodes[pos.y][pos.x];
	if (initialize && !node.edges) {
		node.edges = [];
		for (const neighborPos of neighbors(pos)) {
			// TODO Work with pixels instead of grid locations
			if (!canvas.walls.checkCollision(new Ray(getCenterFromGridPositionObj(pos), getCenterFromGridPositionObj(neighborPos)))) {
				const neighbor = get_node(neighborPos, false);
				node.edges.push({target: neighbor, cost: 1});
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

function calculate_path(from, to) {
	const nextNodes = [{node: get_node(to), cost: 0, estimated: estimate_cost(to, from), previous: null}];
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
			const neighborNode = get_node(edge.target);
			if (previousNodes.has(neighborNode))
				continue;
			// TODO We currently assume a cost of one for all transitions. Change this for 5/10/5 or difficult terrain support
			// We charge an extra 0.0001 for diagonals
			const isDiagonal = currentNode.node.x !== neighborNode.x && currentNode.node.y !== neighborNode.y;
			const edgeCost = isDiagonal ? 1.0001 : 1;
			const neighbor = {node: neighborNode, cost: currentNode.cost + edgeCost, estimated: currentNode.cost + edgeCost + estimate_cost(neighborNode, from), previous: currentNode};
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

function estimate_cost(pos, target) {
	return Math.max(Math.abs(pos.x - target.x), Math.abs(pos.y - target.y));
}

export function find_path(from, to) {
	const lastNode = calculate_path(from, to);
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

export function wipe_cache() {
	cached_nodes = undefined;
}
