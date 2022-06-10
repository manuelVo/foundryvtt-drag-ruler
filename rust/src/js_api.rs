use js_sys::Array;
use sha1::{Digest, Sha1};
use wasm_bindgen::prelude::*;

use crate::{
	geometry::{Circle, LineSegment, Point, Rectangle},
	pathfinder::{DiscoveredNodePtr, Pathfinder},
	util::Windows,
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

	#[wasm_bindgen(js_namespace = ["dragRuler", "private"], js_name=terrainRulerWrapper)]
	pub fn distance_with_terrain(a: Point, b: Point) -> f64;
}

#[wasm_bindgen]
extern "C" {
	pub type JsWall;
	pub type JsWallData;
	pub type JsWallFlags;
	pub type JsWallHeight;

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

	#[wasm_bindgen(method, getter)]
	fn flags(this: &JsWallData) -> JsWallFlags;

	#[wasm_bindgen(method, getter, js_name = "wallHeight")]
	fn wall_height(this: &JsWallFlags) -> Option<JsWallHeight>;

	#[wasm_bindgen(method, getter, js_name = "wallHeightTop")]
	fn top(this: &JsWallHeight) -> Option<f64>;

	#[wasm_bindgen(method, getter, js_name = "wallHeightBottom")]
	fn bottom(this: &JsWallHeight) -> Option<f64>;
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
extern "C" {
	pub type JsTerrainInfo;
	pub type JsTerrainObject;
	pub type JsTerrainShape;

	#[wasm_bindgen(method, getter)]
	fn object(this: &JsTerrainInfo) -> JsTerrainObject;

	#[wasm_bindgen(method, getter)]
	fn shape(this: &JsTerrainInfo) -> JsTerrainShape;

	#[wasm_bindgen(method, getter)]
	fn x(this: &JsTerrainObject) -> f64;

	#[wasm_bindgen(method, getter)]
	fn y(this: &JsTerrainObject) -> f64;

	#[wasm_bindgen(method, getter)]
	fn width(this: &JsTerrainObject) -> f64;

	#[wasm_bindgen(method, getter)]
	fn height(this: &JsTerrainObject) -> f64;

	#[wasm_bindgen(method, getter, js_name = "type")]
	fn shape_type(this: &JsTerrainShape) -> u32;

	#[wasm_bindgen(method, getter)]
	fn x(this: &JsTerrainShape) -> f64;

	#[wasm_bindgen(method, getter)]
	fn y(this: &JsTerrainShape) -> f64;

	#[wasm_bindgen(method, getter)]
	fn radius(this: &JsTerrainShape) -> f64;

	#[wasm_bindgen(method, getter)]
	fn points(this: &JsTerrainShape) -> Vec<f64>;
}

impl JsTerrainObject {
	fn to_bounding_rect(&self) -> Rectangle {
		let left = self.x();
		let top = self.y();
		let right = left + self.width();
		let bottom = top + self.height();
		Rectangle::new(left, top, right, bottom)
	}
}

impl JsTerrainShape {
	fn to_segments(&self, x: f64, y: f64) -> Vec<LineSegment> {
		let points = self.points();
		assert!(points.len() % 2 == 0);
		points
			.chunks(2)
			.map(|coordinates| Point::new(coordinates[0] + x, coordinates[1] + y))
			.windows()
			.map(|(p1, p2)| LineSegment::new(p1, p2))
			.collect()
	}

	fn to_circle(&self, x: f64, y: f64) -> Circle {
		let center = Point::new(self.x() + x, self.y() + y);
		let radius = self.radius();
		Circle { center, radius }
	}
}

impl From<&JsTerrainInfo> for TerrainShape {
	fn from(terrain: &JsTerrainInfo) -> Self {
		let shape = terrain.shape();
		let object = terrain.object();
		let x = object.x();
		let y = object.y();
		match shape.shape_type() {
			0 => TerrainShape::Polygon(shape.to_segments(x, y)),
			2 => TerrainShape::Circle(shape.to_circle(x, y)),
			_ => unimplemented!(),
		}
	}
}

#[derive(Debug, Clone)]
pub enum TerrainShape {
	Polygon(Vec<LineSegment>),
	Circle(Circle),
}

#[derive(Debug, Clone)]
pub struct Terrain {
	pub shape: TerrainShape,
	pub bounding_box: Rectangle,
}

impl From<&JsTerrainInfo> for Terrain {
	fn from(terrain: &JsTerrainInfo) -> Self {
		let bounding_box = terrain.object().to_bounding_rect();
		let shape = terrain.into();
		Self {
			bounding_box,
			shape,
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

#[derive(Debug, Copy, Clone)]
pub struct WallHeight {
	pub top: f64,
	pub bottom: f64,
}

impl Default for WallHeight {
	fn default() -> Self {
		Self {
			top: f64::INFINITY,
			bottom: f64::NEG_INFINITY,
		}
	}
}

impl From<Option<JsWallHeight>> for WallHeight {
	fn from(height: Option<JsWallHeight>) -> Self {
		let height = height
			.map(|height| (height.top(), height.bottom()))
			.unwrap_or((None, None));
		let top = height.0.unwrap_or(WallHeight::default().top);
		let bottom = height.1.unwrap_or(WallHeight::default().bottom);
		Self { top, bottom }
	}
}

impl WallHeight {
	pub fn contains(&self, height: f64) -> bool {
		self.top >= height && self.bottom <= height
	}
}

#[derive(Debug, Clone, Copy)]
pub struct Wall {
	pub p1: Point,
	pub p2: Point,
	pub door_type: DoorType,
	pub door_state: DoorState,
	pub move_type: WallSenseType,
	pub height: WallHeight,
}

impl Wall {
	pub fn new(
		p1: Point,
		p2: Point,
		door_type: DoorType,
		door_state: DoorState,
		move_type: WallSenseType,
		height: WallHeight,
	) -> Self {
		Self {
			p1,
			p2,
			door_type,
			door_state,
			move_type,
			height,
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
	fn from_js(wall: &JsWall, enable_height: bool) -> Self {
		let data = wall.data();
		let mut c = data.c();
		c.iter_mut().for_each(|val| *val = val.round());
		let height = if enable_height {
			data.flags().wall_height().into()
		} else {
			WallHeight::default()
		};
		Self::new(
			Point::new(c[0], c[1]),
			Point::new(c[2], c[3]),
			data.door_type(),
			data.door_state(),
			data.move_type(),
			height,
		)
	}
}

#[allow(dead_code)]
#[wasm_bindgen]
pub fn initialize(
	js_walls: Vec<JsValue>,
	js_terrain: Vec<JsTerrainInfo>,
	token_size: f64,
	token_elevation: f64,
	enable_height: bool,
) -> Pathfinder {
	let mut walls = Vec::with_capacity(js_walls.len());
	for wall in js_walls {
		let wall = JsWall::from(wall);
		walls.push(Wall::from_js(&wall, enable_height));
	}
	let terrain = js_terrain.iter().map(|terrain| terrain.into()).collect();
	Pathfinder::initialize(walls, terrain, token_size, token_elevation)
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

#[allow(dead_code)]
#[wasm_bindgen]
pub fn sha1(input: &str) -> String {
	let mut hasher = Sha1::new();
	hasher.update(input);
	format!("{:x}", hasher.finalize())
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
