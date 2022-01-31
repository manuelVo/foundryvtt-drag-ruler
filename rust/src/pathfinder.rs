use std::{cell::RefCell, f64::consts::PI, rc::Rc};

use wasm_bindgen::prelude::*;

use rustc_hash::FxHashMap;

use crate::{
	geometry::Point,
	js_api::{collides_with_wall, Wall},
	ptr_indexed_hash_set::PtrIndexedHashSet,
};

pub struct Edge {
	target: NodePtr,
	cost: f64,
}

pub struct Node {
	pub point: Point,
	edges: Option<Vec<Edge>>,
}

impl Node {
	pub fn new(point: Point) -> Self {
		Self { point, edges: None }
	}
}

type NodePtr = Rc<RefCell<Node>>;

impl From<Node> for NodePtr {
	fn from(node: Node) -> Self {
		Rc::new(RefCell::new(node))
	}
}

pub struct DiscoveredNode {
	pub node: NodePtr,
	cost: f64,
	estimated: f64,
	pub previous: Option<DiscoveredNodePtr>,
}

pub type DiscoveredNodePtr = Rc<RefCell<DiscoveredNode>>;

impl From<DiscoveredNode> for DiscoveredNodePtr {
	fn from(node: DiscoveredNode) -> Self {
		Rc::new(RefCell::new(node))
	}
}

#[derive(Default, Clone)]
pub struct NodeStorage(Vec<NodePtr>);

impl NodeStorage {
	fn new() -> Self {
		Self::default()
	}

	fn push(&mut self, node: NodePtr) {
		self.0.push(node);
	}

	fn initialize_edges(&self, node: &NodePtr) {
		if node.borrow().edges.is_some() {
			return;
		}
		let point = node.borrow().point;
		let mut edges = Vec::new();
		for neighbor in &self.0 {
			if Rc::ptr_eq(neighbor, node) {
				continue;
			}
			let neighbor_point = neighbor.borrow().point;
			if !collides_with_wall(point, neighbor_point) {
				let cost = point.distance_to(neighbor_point);
				edges.push(Edge {
					target: neighbor.clone(),
					cost,
				});
			}
		}

		node.borrow_mut().edges = Some(edges);
	}

	pub fn iter(&self) -> std::slice::Iter<'_, NodePtr> {
		self.0.iter()
	}
}

#[wasm_bindgen]
pub struct Pathfinder {
	#[wasm_bindgen(skip)]
	pub nodes: NodeStorage,
}

impl Pathfinder {
	pub fn initialize<I>(walls: I) -> Self
	where
		I: IntoIterator<Item = Wall>,
	{
		let mut endpoints = FxHashMap::<Point, Vec<f64>>::default();
		for wall in walls {
			let x_diff = wall.p2.x - wall.p1.x;
			let y_diff = wall.p2.y - wall.p1.y;
			let p1_angle = y_diff.atan2(x_diff);
			let p2_angle = (p1_angle + PI).rem_euclid(2.0 * PI);
			for (point, angle) in [(wall.p1, p1_angle), (wall.p2, p2_angle)] {
				let angles = endpoints.entry(point).or_insert_with(Vec::new);
				angles.push(angle);
			}
		}
		endpoints
			.values_mut()
			.for_each(|angles| angles.sort_by(|a, b| a.partial_cmp(b).unwrap()));
		let mut nodes = NodeStorage::new();
		for (point, angles) in endpoints {
			assert!(!angles.is_empty());
			for i in 1..angles.len() {
				let angle1 = angles[i - 1];
				let angle2 = angles[i];
				if angle1 == angle2 {
					continue;
				}
				let angle_between = (angle2 - angle1) / 2.0 + angle1;
				nodes.push(calc_pathfinding_node(point, angle_between));
			}
			let angle1 = angles.last().unwrap();
			let angle2 = angles.first().unwrap() + 2.0 * PI;
			let angle_between = (angle2 - angle1) / 2.0 + angle1;
			let angle_between = angle_between.rem_euclid(2.0 * PI);
			nodes.push(calc_pathfinding_node(point, angle_between));
		}
		// TODO Eliminating nodes close to each other may improve performance
		Self { nodes }
	}

	pub fn find_path(&mut self, from: Point, to: Point) -> Option<DiscoveredNodePtr> {
		let mut nodes = self.nodes.clone();
		nodes.push(NodePtr::from(Node::new(from)));
		let nodes = nodes;
		let to_node = NodePtr::from(Node::new(to));
		nodes.initialize_edges(&to_node);
		let to = DiscoveredNode {
			node: to_node,
			cost: 0.0,
			estimated: to.distance_to(from),
			previous: None,
		};
		// TODO Use a sorted set for next_nodes for better performance
		let mut next_nodes = vec![DiscoveredNodePtr::from(to)];
		let mut previous_nodes = PtrIndexedHashSet::new();
		while !next_nodes.is_empty() {
			// Sort by estimated cost, high to low
			// TODO Maybe tere's a faster way to do this than re-sorting every iteration?
			next_nodes.sort_by(|a, b| {
				b.borrow()
					.estimated
					.partial_cmp(&a.borrow().estimated)
					.unwrap()
			});

			// Get node with cheapest estimate
			let current_node = next_nodes.pop().unwrap();
			if current_node.borrow().node.borrow().point.x == from.x
				&& current_node.borrow().node.borrow().point.y == from.y
			{
				return Some(current_node);
			}
			previous_nodes.insert(current_node.borrow().node.clone());
			for edge in current_node.borrow().node.borrow().edges.as_ref().unwrap() {
				let neighbor = &edge.target;
				if previous_nodes.contains(neighbor) {
					continue;
				}
				nodes.initialize_edges(neighbor);
				let cost = current_node.borrow().cost + edge.cost;
				let discovered_neighbor = DiscoveredNode {
					node: neighbor.clone(),
					cost,
					estimated: cost + neighbor.borrow().point.distance_to(from),
					previous: Some(current_node.clone()),
				};
				let neighbor_entry = next_nodes
					.iter()
					.find(|node| Rc::ptr_eq(&node.borrow().node, neighbor));
				if let Some(entry) = neighbor_entry {
					// If the neighbor is cheaper to reach via the current route than through previously discovered routes, replace it
					if entry.borrow().cost > cost {
						*entry.borrow_mut() = discovered_neighbor;
					}
				} else {
					next_nodes.push(discovered_neighbor.into());
				}
			}
		}
		None
	}
}

fn calc_pathfinding_node(p: Point, angle: f64) -> NodePtr {
	let diatance_from_walls = 10.0;
	let x = p.x + angle.cos() * diatance_from_walls;
	let y = p.y + angle.sin() * diatance_from_walls;
	NodePtr::from(Node::new(Point { x, y }))
}
