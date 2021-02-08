[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/staebchenfisch)

# Drag Ruler
This module shows a ruler when you drag a token to infrom you how far you've dragged the token from it's start point. Additionally, if you're using a grid, the spaces the token will travel though will be colored depending on your tokens speed. If you're using a gridless map the ruler color will change to convey this information.


## Path color
![Drag Ruler demonstration](https://raw.githubusercontent.com/manuelVo/foundryvtt-drag-ruler/5177746fbb4edb28b6ba09137247d142af575c47/media/drag_ruler.webp)

The token has a speed of 30ft. All squares on the path within that range are colored in the players color. If the token is running it can cover double that range (this can be changed in the settings). All Squares on the path that can only be reached while running are colored in yellow. Squares on the path that the token cannot possibly reached at regular speeds are colored red. This coloring behavior can be tweaked in the settings and can be overridden by modules and game systems to provide more granular, game system specific control. For more information on how to do this see the [API](#api) section of this document.


## Waypoints
You can add waypoints to the path by pressing spacebar while you drag the token. To remove a placed waypoint press the right mouse button.

![Demonstration of Waypoints](https://raw.githubusercontent.com/manuelVo/foundryvtt-drag-ruler/5177746fbb4edb28b6ba09137247d142af575c47/media/waypoints.webp)


## Why would I want to use this instead of ShowDragDistance?
ShowDragDistance isn't maintained anymore. This means that it is at risk to stop working with every foundry update. In fact this process has already begun. As of Foundry Version 0.7.9 ShowDragDistance doesn't work anymore on gridless maps. Drag Ruler on the other hand is fully compatible with the current Foundry release and I'll continue updating it for future foundry releases for the forseeable future.

In addition Drag Ruler provides more flexibility for game systems and modules via it's api to provide an experience that fits the rules of the game system that you are playing best.


## Game systems with Drag Ruler integration
Drag Ruler will work with all Foundry VTT game systems. However some game systems offer a special integration via the [Drag Ruler API](#api), that allows Drag Ruler to take the rules of the game system into account when dispaying speeds (such as weight carried or conditions that apply to the character), offering a smoother experience. While some game systems offer this integration natively, for other game systems there are modules providing the integration. If the integration is provided via a module you need to install and activate both Drag Ruler and the integration module to benefit from the integration.

The game systems that offer Drag Ruler integration are:
- Pathfinder 1 (starting with version 0.77.3)
- Pathfinder 2e (via the module [PF2E Drag Ruler Integration](https://foundryvtt.com/packages/pf2e-dragruler/))


## API
*Audience: This paragraph is intended for module and system devleopers that want to add more complex behavior to Drag Ruler. If you just want to use this plugins features skip this paragraph.*

The path coloring behavior of Drag Ruler can be altered by modules and systems to allow for for more complex coloring than provided by default. This allows specifying custom colors, using more different colors than offered by default and performing more calculations for determining the colors (for example a token may only be allowd to run if it isn't waring armor). Doing so is simple. This paragraph gives a short introduction on how to accomplish this, followed by a full example of how a call to the api might look like.

### Registering your Module/System
*This section is written from the perspective of a module developer. If you're writing a game system the process is exactly the same, except that you need to invoke `registerSystem` instead of `registerModule` and need to use the id of your system instead of a module id.*

The first thing you'll have to do is to make your module known to Drag Ruler. To do this, you have to call the `dragRuler.registerModule` function after the `dragRuler.ready` hook has fired. This might look like this:

```javascript
Hooks.once("dragRuler.ready", () => {
	dragRuler.registerModule("id-of-your-module", mySpeedProvider)
})
```

The function `registerModule` takes two parameters: The first parameter must be the ID of your module as specified in your manifest. The second parameter is a reference to the Speed Provider of your module. What that Speed Provider looks like will be detailed in the paragraph [Writing the Speed Provider](#writing-the-speed-provider)

### Writing the Speed Provider
The Speed Provider is a function that calculates the speeds that a token can reach and assigns a color to each of the speeds. That function receives two arguments. The first argument is the token for which the speed should be calculated. The second argument is the color of the player that is dragging the token.

The function should contain an array of objects in the format `{range: Integer, color: Integer}`. The range indicates a distance that the token can cover with a certain speed and the color indicates which color should be used for that range. Spaces that cannot be reached with any of the speeds provided by this function will be colored in red (`0xFF0000`). The returned array doesn't need to be sorted in any particular order. However the array is not allowe to contain two objects with an identical range, as that results in undefined behavior.

The Speed Provider will be called once for each square that will be colored. For this reason it is advisable to not perform any expensive calculations in the Speed Provider.

Here is an example of how a Speed Provider might look like:
```javascript
function mySpeedProvider(token, playerColor) {
	const baseSpeed = token.actor.data.speed
	const ranges = [{range: baseSpeed, color: playerColor}, {range: baseSpeed * 2, color: 0xFFFF00}]
	if (!token.actor.data.isWearingArmor) {
		ranges.push({range: baseSpeed * 3, color: 0xFF8000})
	}
	return ranges
}
```

With this speed provider, the fields reachable with the token's base speed will be colored in the color of the player that is dragging the token. Each token is able to dash, which allows it to run twice it's base speed. Spaces that are reachable by dashing will be colored yellow (`0xFFFF00`). If the token isn't wearing any armor it is also allowed to sprint, allowing it to cover a distance of 3 times it's base speed. Those squares will be colored in orange (`0xFF8000`). All spaces further away from the token will be colored in red. Tokens wearing armor aren't allowed to sprint and for them all spaces that exceed 2 times their base speed will be colored red.

### Full example
This is a full example of how using the api might look like. It's built from the examples above. For a explanation to what is going on refer to the previous chapters.

```javascript
Hooks.once("dragRuler.ready", () => {
	dragRuler.registerModule("id-of-your-module", mySpeedProvider)
})

function mySpeedProvider(token, playerColor) {
	const baseSpeed = token.actor.data.speed
	const ranges = [{range: baseSpeed, color: playerColor}, {range: baseSpeed * 2, color: 0xFFFF00}]
	if (!token.actor.data.isWearingArmor) {
		ranges.push({range: baseSpeed * 3, color: 0xFF8000})
	}
	return ranges
}
```
