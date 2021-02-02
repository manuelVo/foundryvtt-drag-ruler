// This is a modified version of Ruler.moveToken from foundry 0.7.9
export async function moveTokens(selectedTokens) {
	let wasPaused = game.paused;
	if (wasPaused && !game.user.isGM) {
		ui.notifications.warn(game.i18n.localize("GAME.PausedWarning"));
		return false;
	}
	if (!this.visible || !this.destination) return false;
	const draggedToken = this._getMovementToken();
	if (!draggedToken) return;

	// Get the movement rays and check collision along each Ray
	// These rays are center-to-center for the purposes of collision checking
	const rays = this._getRaysFromWaypoints(this.waypoints, this.destination);
	if (!game.user.isGM) {
		const hasCollision = selectedTokens.some(token => {
			const offset = calculateTokenOffset(token, draggedToken)
			const offsetRays = rays.map(ray => applyOffsetToRay(ray, offset))
			return offsetRays.some(r => canvas.walls.checkCollision(r));
		})
		if (hasCollision) {
			ui.notifications.error(game.i18n.localize("ERROR.TokenCollide"));
			this._endMeasurement();
			return true;
		}
	}

	// Execute the movement path.
	// Transform each center-to-center ray into a top-left to top-left ray using the prior token offsets.
	this._state = Ruler.STATES.MOVING;
	await Promise.all(selectedTokens.map(token => {
		// Return the promise so we can wait for it outside the loop
		const offset = calculateTokenOffset(token, draggedToken)
		return animateToken.call(this, token, rays, offset, wasPaused)
	}))

	// Once all animations are complete we can clear the ruler
	this._endMeasurement();
}

// This is a modified version code extracted from Ruler.moveToken from foundry 0.7.9
async function animateToken(token, rays, tokenOffset, wasPaused) {
	const offsetRays = rays.map(ray => applyOffsetToRay(ray, tokenOffset))

	// Determine offset relative to the Token top-left.
	// This is important so we can position the token relative to the ruler origin for non-1x1 tokens.
	const origin = canvas.grid.getTopLeft(this.waypoints[0].x + tokenOffset.x, this.waypoints[0].y + tokenOffset.y);
	const s2 = canvas.dimensions.size / 2;
	const dx = Math.round((token.data.x - origin[0]) / s2) * s2;
	const dy = Math.round((token.data.y - origin[1]) / s2) * s2;

	token._noAnimate = true;
	for (let r of offsetRays) {
		if (!wasPaused && game.paused) break;
		const dest = canvas.grid.getTopLeft(r.B.x, r.B.y);
		const path = new Ray({ x: token.x, y: token.y }, { x: dest[0] + dx, y: dest[1] + dy });
		await token.update(path.B);
		await token.animateMovement(path);
	}
	token._noAnimate = false;
}

function calculateTokenOffset(tokenA, tokenB) {
	return {x: tokenA.data.x - tokenB.data.x, y: tokenA.data.y - tokenB.data.y}
}

function applyOffsetToRay(ray, offset) {
	return new Ray({x: ray.A.x + offset.x, y: ray.A.y + offset.y}, {x: ray.B.x + offset.x, y: ray.B.y + offset.y})
}
