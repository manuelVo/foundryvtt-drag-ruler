use std::{cell::RefCell, f64::consts::PI, rc::Rc};

use wasm_bindgen::prelude::*;

use rustc_hash::FxHashMap;

use crate::{
	geometry::{LineSegment, Point},
	js_api::{Wall, WallSenseType},
	ptr_indexed_hash_set::PtrIndexedHashSet,
};

pub struct Edge {
	target: NodePtr,
	cost: f64,
}

pub struct Node {
	pub point: Point,
	edges: Option<Vec<Edge>>,
	final_edge: Option<Option<Edge>>,
}

impl Node {
	pub fn new(point: Point) -> Self {
		Self {
			point,
			edges: None,
			final_edge: None,
		}
	}

	fn iter_edges(
		&self,
	) -> std::iter::Chain<std::slice::Iter<'_, Edge>, std::option::Iter<'_, Edge>> {
		self.edges
			.as_ref()
			.unwrap()
			.iter()
			.chain(self.final_edge.as_ref().unwrap().iter())
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
pub struct NodeStorage {
	regular_nodes: Vec<NodePtr>,
	final_node: Option<NodePtr>,
}

pub type NodeStorageIterator<'a> = std::iter::Chain<
	std::slice::Iter<'a, Rc<RefCell<Node>>>,
	std::option::Iter<'a, Rc<RefCell<Node>>>,
>;

impl NodeStorage {
	fn new() -> Self {
		Self::default()
	}

	fn push(&mut self, node: NodePtr) {
		self.regular_nodes.push(node);
	}

	fn initialize_edges(&mut self, node: &NodePtr, walls: &[LineSegment]) {
		if node.borrow().final_edge.is_none() {
			let final_edge = self
				.final_node
				.as_ref()
				.filter(|neighbor| {
					!self.collides_with_wall(
						&LineSegment::new(node.borrow().point, neighbor.borrow().point),
						walls,
					)
				})
				.map(|neighbor| Edge {
					target: neighbor.clone(),
					cost: node.borrow().point.distance_to(neighbor.borrow().point),
				});
			node.borrow_mut().final_edge = Some(final_edge);
		}

		if node.borrow().edges.is_some() {
			return;
		}

		let point = node.borrow().point;
		let mut edges = Vec::new();
		for neighbor in &self.regular_nodes {
			if Rc::ptr_eq(neighbor, node) {
				continue;
			}
			let neighbor_point = neighbor.borrow().point;
			if !self.collides_with_wall(&LineSegment::new(point, neighbor_point), walls) {
				let cost = point.distance_to(neighbor_point);
				edges.push(Edge {
					target: neighbor.clone(),
					cost,
				});
			}
		}
		node.borrow_mut().edges = Some(edges);
	}

	fn collides_with_wall(&self, line: &LineSegment, walls: &[LineSegment]) -> bool {
		walls.iter().any(|wall| line.intersection(wall).is_some())
	}

	pub fn cleanup_final_edges(&mut self) {
		for node in &self.regular_nodes {
			node.borrow_mut().final_edge = None;
		}
	}

	pub fn iter(&self) -> NodeStorageIterator {
		self.regular_nodes.iter().chain(self.final_node.iter())
	}
}

#[wasm_bindgen]
pub struct Pathfinder {
	#[wasm_bindgen(skip)]
	pub nodes: NodeStorage,
	#[wasm_bindgen(skip)]
	pub walls: Vec<LineSegment>,
}

impl Pathfinder {
	pub fn initialize<I>(walls: I, token_size: f64, token_elevation: f64) -> Self
	where
		I: IntoIterator<Item = Wall>,
	{
		let distance_from_walls = token_size / 2.0;
		let mut endpoints = FxHashMap::<Point, Vec<f64>>::default();
		let mut line_segments = Vec::new();
		for wall in walls {
			if wall.move_type == WallSenseType::NONE {
				continue;
			}
			if wall.is_door() && wall.is_open() {
				continue;
			}
			if !wall.height.contains(token_elevation) {
				continue;
			}
			let x_diff = wall.p2.x - wall.p1.x;
			let y_diff = wall.p2.y - wall.p1.y;
			let p1_angle = y_diff.atan2(x_diff).rem_euclid(2.0 * PI);
			let p2_angle = (p1_angle + PI).rem_euclid(2.0 * PI);
			for (point, angle) in [(wall.p1, p1_angle), (wall.p2, p2_angle)] {
				let angles = endpoints.entry(point).or_insert_with(Vec::new);
				angles.push(angle);
			}
			line_segments.push(LineSegment::new(wall.p1, wall.p2));
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
				let angle_diff = angle2 - angle1;
				if angle_diff <= PI {
					continue;
				}
				let angle_between = angle_diff / 2.0 + angle1;
				nodes.push(calc_pathfinding_node(
					point,
					angle_between,
					distance_from_walls,
					&mut line_segments,
				));
				nodes.push(calc_pathfinding_node(
					point,
					angle1 + 0.5 * PI,
					distance_from_walls,
					&mut line_segments,
				));
				nodes.push(calc_pathfinding_node(
					point,
					angle2 - 0.5 * PI,
					distance_from_walls,
					&mut line_segments,
				));
			}
			let angle1 = angles.last().unwrap();
			let angle2 = angles.first().unwrap() + 2.0 * PI;
			let angle_diff = angle2 - angle1;
			if angle_diff <= PI {
				continue;
			}
			let angle_between = angle_diff / 2.0 + angle1;
			nodes.push(calc_pathfinding_node(
				point,
				angle_between,
				distance_from_walls,
				&mut line_segments,
			));
			nodes.push(calc_pathfinding_node(
				point,
				angle1 + 0.5 * PI,
				distance_from_walls,
				&mut line_segments,
			));
			nodes.push(calc_pathfinding_node(
				point,
				angle2 - 0.5 * PI,
				distance_from_walls,
				&mut line_segments,
			));
		}
		// TODO Eliminating nodes close to each other may improve performance
		Self {
			nodes,
			walls: line_segments,
		}
	}

	pub fn find_path(&mut self, from: Point, to: Point) -> Option<DiscoveredNodePtr> {
		self.nodes.cleanup_final_edges();
		let mut nodes = self.nodes.clone();
		nodes.final_node = Some(NodePtr::from(Node::new(from)));
		let to_node = NodePtr::from(Node::new(to));
		nodes.initialize_edges(&to_node, &self.walls);
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
			for edge in current_node.borrow().node.borrow().iter_edges() {
				let neighbor = &edge.target;
				if previous_nodes.contains(neighbor) {
					continue;
				}
				nodes.initialize_edges(neighbor, &self.walls);
				// Add a flat 0.00001 cost per node to discurage creation of unnecessary waypoints
				let cost = current_node.borrow().cost + edge.cost + 0.00001;
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

fn calc_pathfinding_node(
	p: Point,
	angle: f64,
	distance_from_walls: f64,
	line_segments: &mut Vec<LineSegment>,
) -> NodePtr {
	let offset_x = angle.cos() * distance_from_walls;
	let offset_y = angle.sin() * distance_from_walls;
	line_segments.push(LineSegment::new(
		p,
		Point {
			x: p.x + offset_x * 0.99,
			y: p.y + offset_y * 0.99,
		},
	));
	NodePtr::from(Node::new(Point {
		x: p.x + offset_x,
		y: p.y + offset_y,
	}))
}
