use std::hash::{Hash, Hasher};

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
	pub type JsPoint;

	#[wasm_bindgen(method, getter)]
	fn x(this: &JsPoint) -> f64;

	#[wasm_bindgen(method, getter)]
	fn y(this: &JsPoint) -> f64;
}

#[wasm_bindgen]
#[derive(Debug, Copy, Clone)]
pub struct Point {
	pub x: f64,
	pub y: f64,
}

impl Point {
	pub fn new(x: f64, y: f64) -> Self {
		Self { x, y }
	}

	pub fn distance_to(&self, to: Point) -> f64 {
		(self.y - to.y).hypot(self.x - to.x)
	}

	pub fn is_same_as(&self, other: &Self) -> bool {
		let e = 0.000001;
		(self.x - other.x).abs() < e && (self.y - other.y).abs() < e
	}
}

impl Eq for Point {}

impl PartialEq for Point {
	fn eq(&self, other: &Self) -> bool {
		self.x == other.x && self.y == other.y
	}
}

impl Hash for Point {
	fn hash<H: Hasher>(&self, hasher: &mut H) {
		self.x.to_bits().hash(hasher);
		self.y.to_bits().hash(hasher);
	}
}

impl From<&JsPoint> for Point {
	fn from(point: &JsPoint) -> Self {
		Self::new(point.x(), point.y())
	}
}
