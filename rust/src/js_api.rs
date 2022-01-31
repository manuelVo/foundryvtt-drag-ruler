use js_sys::Array;
use wasm_bindgen::prelude::*;

use crate::{
	geometry::Point,
	pathfinder::{DiscoveredNodePtr, Pathfinder},
};

#[allow(unused)]
macro_rules! log {
	( $( $t:tt )* ) => {
		log(&format!( $( $t )* ));
	};
}

#[wasm_bindgen]
extern "C" {
	#[wasm_bindgen(js_namespace = console, js_name=warn)]
	pub fn log(s: &str);
}

#[wasm_bindgen(
	inline_js = "export function collidesWithWall(p1, p2) { return canvas.walls.checkCollision(new Ray(p1, p2));}"
)]
extern "C" {
	#[wasm_bindgen(js_name=collidesWithWall)]
	pub fn collides_with_wall(p1: Point, p2: Point) -> bool;
}

#[wasm_bindgen]
extern "C" {
	pub type JsWall;
	pub type JsWallData;

	#[wasm_bindgen(method, getter)]
	fn data(this: &JsWall) -> JsWallData;

	#[wasm_bindgen(method, getter)]
	fn c(this: &JsWallData) -> Vec<f64>;
}

#[wasm_bindgen]
extern "C" {
	pub type JsPoint;

	#[wasm_bindgen(method, getter)]
	fn x(this: &JsPoint) -> f64;

	#[wasm_bindgen(method, getter)]
	fn y(this: &JsPoint) -> f64;
}

impl From<JsPoint> for Point {
	fn from(point: JsPoint) -> Self {
		Point {
			x: point.x(),
			y: point.y(),
		}
	}
}

#[derive(Debug, Clone, Copy)]
pub struct Wall {
	pub p1: Point,
	pub p2: Point,
}

impl Wall {
	pub fn new(p1: Point, p2: Point) -> Self {
		Self { p1, p2 }
	}
}

impl Wall {
	fn from_js(wall: &JsWall) -> Self {
		let data = wall.data();
		let mut c = data.c();
		c.iter_mut().for_each(|val| *val = val.round());
		Self::new(Point::new(c[0], c[1]), Point::new(c[2], c[3]))
	}
}

#[allow(dead_code)]
#[wasm_bindgen]
pub fn initialize(js_walls: Vec<JsValue>) -> Pathfinder {
	let mut walls = Vec::with_capacity(js_walls.len());
	for wall in js_walls {
		let wall = JsWall::from(wall);
		walls.push(Wall::from_js(&wall));
	}
	Pathfinder::initialize(walls)
}

#[allow(dead_code)]
#[wasm_bindgen]
pub fn free(pathfinder: Pathfinder) {
	drop(pathfinder);
}

#[allow(dead_code)]
#[wasm_bindgen(js_name=findPath)]
pub fn find_path(pathfinder: &mut Pathfinder, from: JsPoint, to: JsPoint) -> Option<Array> {
	pathfinder
		.find_path(from.into(), to.into())
		.map(|first_node| first_node.iter_path().map(JsValue::from).collect())
}

#[allow(dead_code)]
#[wasm_bindgen(js_name=debugGetPathfindingPoints)]
pub fn debug_get_pathfinding_points(pathfinder: &Pathfinder) -> Array {
	pathfinder
		.nodes
		.iter()
		.map(|node| node.borrow().point)
		.map(JsValue::from)
		.collect()
}

trait IteratePath {
	fn iter_path(&self) -> PathIterator;
}

impl IteratePath for DiscoveredNodePtr {
	fn iter_path(&self) -> PathIterator {
		PathIterator {
			current_node: Some(self.clone()),
		}
	}
}

struct PathIterator {
	current_node: Option<DiscoveredNodePtr>,
}

impl Iterator for PathIterator {
	type Item = Point;

	fn next(&mut self) -> Option<Self::Item> {
		if let Some(node) = self.current_node.clone() {
			let point = node.borrow().node.borrow().point;
			self.current_node = node.borrow().previous.clone();
			Some(point)
		} else {
			None
		}
	}
}
