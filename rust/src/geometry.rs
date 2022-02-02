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

	pub fn from_line_x(line: &Line, x: f64) -> Self {
		let y = line.calc_y(x);
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

#[derive(Debug, Copy, Clone)]
pub struct Line {
	pub m: f64,
	pub b: f64,
	pub p1: Point,
}

impl Line {
	pub fn new(m: f64, b: f64, p1: Point) -> Self {
		Self { m, b, p1 }
	}

	pub fn from_points(p1: Point, p2: Point) -> Self {
		let m = (p1.y - p2.y) / (p1.x - p2.x);
		let b = p1.y - m * p1.x;
		Self { m, b, p1 }
	}

	pub fn from_point_and_angle(p1: Point, angle: f64) -> Self {
		let p2 = Point {
			x: p1.x - angle.cos(),
			y: p1.y - angle.sin(),
		};
		Line::from_points(p1, p2)
	}

	pub fn is_vertical(&self) -> bool {
		self.m.is_infinite()
	}

	pub fn is_horizontal(&self) -> bool {
		self.m == 0.0
	}

	pub fn calc_x(&self, y: f64) -> f64 {
		(y - self.b) / self.m
	}

	pub fn calc_y(&self, x: f64) -> f64 {
		self.m * x + self.b
	}

	pub fn intersection(&self, other: &Line) -> Option<Point> {
		// Are both lines vertical?
		if self.is_vertical() && other.is_vertical() {
			return None;
		}

		// Are the lines paralell?
		if (self.m - other.m).abs() < 0.00000005 {
			return None;
		}

		// Is one of the lines vertical?
		if self.is_vertical() || other.is_vertical() {
			let vertical;
			let regular;
			if self.is_vertical() {
				vertical = self;
				regular = other;
			} else {
				vertical = other;
				regular = self;
			}
			return Some(Point::from_line_x(regular, vertical.p1.x));
		}

		// Calculate x coordinate of intersection point between both lines
		// Find intersection point: x * m1 + b1 = x * m2 + b2
		// Solve for x: x = (b1 - b2) / (m2 - m1)
		let x = (self.b - other.b) / (other.m - self.m);
		if self.m.abs() < other.m.abs() {
			Some(Point::from_line_x(self, x))
		} else {
			Some(Point::from_line_x(other, x))
		}
	}

	pub fn get_perpendicular_through_point(&self, p: Point) -> Self {
		let m = -1.0 / self.m;
		let b = p.y - m * p.x;
		Self { m, b, p1: p }
	}
}

#[derive(Debug, Clone, Copy)]
pub struct LineSegment {
	pub p1: Point,
	pub p2: Point,
	pub line: Line,
}

impl LineSegment {
	pub fn new(p1: Point, p2: Point) -> Self {
		Self {
			p1,
			p2,
			line: Line::from_points(p1, p2),
		}
	}

	pub fn intersection(&self, other: &LineSegment) -> Option<Point> {
		let intersection = self.line.intersection(&other.line);
		intersection.filter(|intersection| {
			self.is_intersection_on_segment(*intersection)
				&& other.is_intersection_on_segment(*intersection)
		})
	}

	fn is_intersection_on_segment(&self, intersection: Point) -> bool {
		if intersection.is_same_as(&self.p1) || intersection.is_same_as(&self.p2) {
			return true;
		}
		if self.line.is_vertical() || self.line.m.abs() > 1.0 {
			return between(intersection.y, self.p1.y, self.p2.y);
		}
		between(intersection.x, self.p1.x, self.p2.x)
	}
}

pub fn between<T: Copy + PartialOrd>(num: T, a: T, b: T) -> bool {
	let (min, max) = if a < b { (a, b) } else { (b, a) };
	num >= min && num <= max
}
