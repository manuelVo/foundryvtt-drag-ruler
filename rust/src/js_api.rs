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

#[wasm_bindgen]
extern "C" {
	pub type JsWall;
	pub type JsWallData;

	#[wasm_bindgen(method, getter)]
	fn data(this: &JsWall) -> JsWallData;

	#[wasm_bindgen(method, getter)]
	fn c(this: &JsWallData) -> Vec<f64>;

	#[wasm_bindgen(method, getter, js_name = "door")]
	fn door_type(this: &JsWallData) -> DoorType;

	#[wasm_bindgen(method, getter, js_name = "ds")]
	fn door_state(this: &JsWallData) -> DoorState;

	#[wasm_bindgen(method, getter, js_name = "move")]
	fn move_type(this: &JsWallData) -> WallSenseType;
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

#[wasm_bindgen]
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum DoorState {
	CLOSED = 0,
	OPEN = 1,
	LOCKED = 2,
}

impl TryFrom<usize> for DoorState {
	type Error = ();
	fn try_from(value: usize) -> Result<Self, Self::Error> {
		match value {
			x if x == Self::CLOSED as usize => Ok(Self::CLOSED),
			x if x == Self::OPEN as usize => Ok(Self::OPEN),
			x if x == Self::LOCKED as usize => Ok(Self::LOCKED),
			_ => Err(()),
		}
	}
}

#[wasm_bindgen]
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum DoorType {
	NONE = 0,
	DOOR = 1,
	SECRET = 2,
}

impl TryFrom<usize> for DoorType {
	type Error = ();
	fn try_from(value: usize) -> Result<Self, Self::Error> {
		match value {
			x if x == Self::NONE as usize => Ok(Self::NONE),
			x if x == Self::DOOR as usize => Ok(Self::DOOR),
			x if x == Self::SECRET as usize => Ok(Self::SECRET),
			_ => Err(()),
		}
	}
}

#[wasm_bindgen]
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum WallSenseType {
	NONE = 0,
	LIMITED = 10,
	NORMAL = 20,
}

impl TryFrom<usize> for WallSenseType {
	type Error = ();
	fn try_from(value: usize) -> Result<Self, Self::Error> {
		match value {
			x if x == Self::NONE as usize => Ok(Self::NONE),
			x if x == Self::LIMITED as usize => Ok(Self::LIMITED),
			x if x == Self::NORMAL as usize => Ok(Self::NORMAL),
			_ => Err(()),
		}
	}
}

#[derive(Debug, Clone, Copy)]
pub struct Wall {
	pub p1: Point,
	pub p2: Point,
	pub door_type: DoorType,
	pub door_state: DoorState,
	pub move_type: WallSenseType,
}

impl Wall {
	pub fn new(p1: Point, p2: Point, door_type: DoorType, door_state: DoorState, move_type: WallSenseType) -> Self {
		Self {
			p1,
			p2,
			door_type,
			door_state,
			move_type,
		}
	}

	pub fn is_door(&self) -> bool {
		self.door_type != DoorType::NONE
	}

	pub fn is_open(&self) -> bool {
		self.door_state == DoorState::OPEN
	}
}

impl Wall {
	fn from_js(wall: &JsWall) -> Self {
		let data = wall.data();
		let mut c = data.c();
		c.iter_mut().for_each(|val| *val = val.round());
		Self::new(
			Point::new(c[0], c[1]),
			Point::new(c[2], c[3]),
			data.door_type(),
			data.door_state(),
			data.move_type(),
		)
	}
}

#[allow(dead_code)]
#[wasm_bindgen]
pub fn initialize(js_walls: Vec<JsValue>, token_size: f64) -> Pathfinder {
	let mut walls = Vec::with_capacity(js_walls.len());
	for wall in js_walls {
		let wall = JsWall::from(wall);
		walls.push(Wall::from_js(&wall));
	}
	Pathfinder::initialize(walls, token_size)
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
