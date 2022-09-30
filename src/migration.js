import {RightClickAction, settingsKey} from "./settings.js";

const currentDataVersion = "1.10.0";

export async function performMigrations() {
	if (game.user.isGM) await performWorldMigraionts();
	await performClientMigrations();
}

async function performWorldMigraionts() {
	let dataVersion = game.settings.get(settingsKey, "dataVersion");

	if (dataVersion === currentDataVersion) return;

	if (dataVersion === "fresh install") {
		game.settings.set(settingsKey, "dataVersion", currentDataVersion);
		return;
	}

	if (dataVersion === "1.3.0") {
		dataVersion = "1.10.0";
	}

	game.settings.set(settingsKey, "dataVersion", dataVersion);
}

async function performClientMigrations() {
	let dataVersion = game.settings.get(settingsKey, "clientDataVersion");

	if (dataVersion === "fresh install") {
		// Start of migration from unnamed version (< 1.10.0). TODO Remove in a future version
		const swapSpacebarRightClick = game.settings.storage
			.get("client")
			.getItem(`${settingsKey}.swapSpacebarRightClick`);
		if (swapSpacebarRightClick) {
			game.settings.set(settingsKey, "rightClickAction", RightClickAction.CREATE_WAYPOINT);
			await game.keybindings.set(settingsKey, "createWaypoint", []);
			await game.keybindings.set(settingsKey, "deleteWaypoint", [{key: "Space"}]);
		}
		// End of migration from unnamed version
		game.settings.set(settingsKey, "clientDataVersion", currentDataVersion);
	}
}
