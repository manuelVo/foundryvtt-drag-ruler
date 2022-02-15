export class Line {
	constructor(m, b) {
		this.m = m;
		this.b = b;
	}

	static fromPoints(p1, p2) {
		// Bring line into y=mx+b form
		const m = (p1.y - p2.y) / (p1.x - p2.x);
		const b = p1.y - m * p1.x;
		return new Line(m, b);
	}

	get isVertical() {
		return !isFinite(this.m);
	}

	calcY(x) {
		return this.m * x + this.b;
	}
}
