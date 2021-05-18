## In development
**BREAKING** This update is incompatible with previous Terrain Ruler versions. If you're using Terrain Ruler, make sure you update Terrain Ruler to at least version 1.3.0.

### New features
- Drag Ruler can now measure difficult terrain on gridless maps (if the Terrain Ruler module is installed and enabled)
- Improved the positioning of the labels around the ruler. The labels should now never overlap with the waypoint.

### Bugfixes
- Fixed a bug that sometimes measured diagonals incorrectly with the 5/10/5 grid rule

### Compatibility
- Drag Ruler's Generic Speed Provider is now aware of good default values for the Starfinder game system

### Translation
- Corrected typos in the german translation (thanks to CarnVanBeck!)


## 1.6.5
### Bugfixes
- Drag Ruler no longer get's stuck if the user presses ESC during drag ([#70](https://github.com/manuelVo/foundryvtt-drag-ruler/issues/70))


## 1.6.4
### Bugfixes
- Fixed a bug where a bug in a Speed Provider could lead to the ruler getting stuck, leaving the token immovable


## 1.6.3
### Bugfixes
- If the movement history for a token is being updated (for example by a history reset by the gm) while a player is currently measuring a distance for that token the history change is now being reflected in the active measurement.

### Compatibility
- Drag Ruler's Generic SpeedProvider is now aware of good default values for the Savage Worlds Adventure Edition game system


## 1.6.2
### Bugfixes
- The reset movement history button now resets the movement history for all players, not just for the GM


## 1.6.1
### API
- Added `onMovementHistoryUpdate` callback to Speed Providers, that allows them to perform game systems specific improvements to the movement history
- Added `dragRuler.resetMovementHistory` that clears the stored movement history for a token.


## 1.6.0
### Performance
- Greatly increased the performance when playing on huge maps and when moving many tokens at once.
- Huge performance improvements for speed providers. (Technical details: `getRanges` is now being called way less frequently)

### New features
- GMs now have an option to reset the movement history for individual tokens in the right click menu of the combat tracker
- When releasing a dragged token while pressing Alt the token will be moved to the target location without an animation ([#3](https://github.com/manuelVo/foundryvtt-drag-ruler/issues/3))

### Bugfixes
- When starting to drag a new token while the previous one is still moving the ruler won't dissappear anymore when the previous token arrives at it's destination.


## 1.5.4
### Bugfixes
- Fixed a bug that prevented tokens from being moved when their movement history collides with a wall. ([#61](https://github.com/manuelVo/foundryvtt-drag-ruler/issues/61))


## 1.5.3
### Compatiblilty
- Drag Ruler's Generic Speed Provider is now able to work with game systems that put non-number characters behind the tokens movement speed (like `30ft.`). One example for such a game system is Dungeon Crawl Classics. ([#60](https://github.com/manuelVo/foundryvtt-drag-ruler/issues/60))
- The Generic Speed Provider now has good default settings for the Dungeon Crawl Classics (dcc) game system.


## 1.5.2
### Bugfixes
- Drag Ruler no longer prevents tokens that don't have an actor from being moved. ([#58](https://github.com/manuelVo/foundryvtt-drag-ruler/issues/58))
- Grid highlighting now also works for tokens that don't have an actor.


## 1.5.1
### Bugfixes
- The hint that tells users how to enable difficult terrain measurement in Drag Ruler is no longer shown if no terrain layer module is installed.


## 1.5.0
### New features
- In combat Drag Ruler will now remember the path that was taken by a token during the turn. Picking the token up during the same turn will continue the previous measurement, taking steps that are already taken into account.

### Module compatibility
- Drag Ruler is now fully compatible with the `Enhanced Terrain Layer` module. ([#50](https://github.com/manuelVo/foundryvtt-drag-ruler/issues/50))


## 1.4.6
### Bugfixes
- Fixed a bug where a token would move to the incorrect location if it is was dragged and released very quickly ([#51](https://github.com/manuelVo/foundryvtt-drag-ruler/issues/51)) - thanks to Silver Raven for helping me track down this bug!


## 1.4.5
### Bugfixes
- Tiny tokens (0.5x0.5 or smaller) now snap to the coners of a square like they do in vanilla foundry ([#49](https://github.com/manuelVo/foundryvtt-drag-ruler/issues/49))
- Fixed a bug that could cause a meausred distance to be wrong when disabling token snapping using the shift key
- Fixed a bug where the highlighted path could have gaps when disabling token snapping using the shift key


## 1.4.4
### Bugfixes
- Fix snapping for tokens that are smaller than 1x1


## 1.4.3
### System compatibility
- Drag Ruler's Generic SpeedProvider is now aware of good default values for the Savage Worlds Adventure Edition game system

### Translation
- Added german translation
- Updated japanese translation (thanks to touge)


## 1.4.2
### Bugfixes
- Drag Ruler now works again on gridless maps

## 1.4.1
### Bugfixes
- Fixed a bug where Drag Ruler wouldn't work at all on hex grids when the Hex Token Size Support isn't installed

### Translation
- Added chinese translation (thanks to zeteticl)


## 1.4.0
### New features
- If the [Terrain Ruler module](https://foundryvtt.com/packages/terrain-ruler/) is installed and activated, Drag Ruler will now take difficult terrain that was placed with the [TerrainLayer module](https://foundryvtt.com/packages/TerrainLayer/) into account.
- The ruler will now always be drawn from the tokens center (even for tokens larger than 1x1) on all grid types (on Hex Grids this requires the Hex Token Size Support module).
- For tokens larger than 1x1 the highlighted path will now reflect the tokens size (on Hex Grids this requires the Hex Token Size Support module)
- The GM's Drag Ruler can now be hidden from non GM players via a setting.
- When multiple different colors apply to a single grid space because the path crosses itself the color representing ranges further away will take priortiy over colors representing closer ranges.

### API
- Speed providers can now selectively ignore difficult terrain and even implement their own cost functions, if the default Drag Ruler behavior doesn't fit the game system. This can be achieved by overriding the new, optional `SpeedProvider` function `getCostForStep`.


## 1.3.5
### Bugfixes
- Fixed a regression where spaces could suddenly change their color during measurement


## 1.3.4
### Module compatibility
- Increased compatiblility with other modules (namely Drag Ruler and Terrain Ruler are no longer incompatible)

## 1.3.3
### Bugfixes
- Speed Provider Settings are now being saved for non GM players


## 1.3.2
### Translation
- Updated japanese translation (thanks to touge)


## 1.3.1
### Bugfixes
- Fixed a bug where the coloring of ranges wouldn't work with the generic speed provider if the Dash Multiplier was set to 0


## 1.3.0
### New features
- The color used to indicate speed ranges is now configurable
- The settings dialog has been reworked

### System compatibility
- Drag Ruler's Generic SpeedProvider is now aware of good default values for the lancer game system (thanks to Grygon)

### API changes
This release introduces a new API that is incompatible with the old API. The new API offers more flexibility for users and Speed Providers alike and allows to add new features in the future without breaking compatibility again. The old API will continue to function, but to profit from any of the features below Speed Providers need to switch to the new API. For more details check out the API documentation.

The following things have changed with the new API:
- Colors used by speed providers can now be changed by the user via configuration
- Speed Providers can now offer settings to the user that will be integrated into Drag Ruler's settings menu
- Speed Providers can now conditionally disable Drag Ruler for some tokens


## 1.2.2
### Translation
- Added japanese translation (thanks to touge)

## 1.2.1
### Compatiblity
- Drag Ruler is now compatible with Hex Token Size Support. For compatibility Hex Token Size Support Version 0.5.4 or higher is required. Thanks to Ourobor for helping making this possible.

## 1.2.0
### New features
- Right click and spacebar can now be swapped, allowing to place waypoints with right click and removing them with spacebar
- The module can now be configured use a fixed color instead of the player color for the first speed range
- On gridless maps the ruler will now change it's color to indicate the different speed ranges
- As an alternative to right click (or spacebar, if you have swapped right and spacebar behavior) waypoints can now also be deleted with the `X` key

### Bugfixes
- Disabling snap to grid with shift now works as expected
- Fixed a bug where the ruler would sometimes jump to a different target location when deleting a waypoint

## 1.1.1
### Bugfixes
- Fixed a bug where tokens wouldn't be moved to the corect end position on gridless maps
- Ruler now appears immediately when the token is being dragged
- On gridless maps the ruler will always start measuring at the center of the token
  - This change has no impact on the distance that is being measured
  - In addition to the cosmetical aspect this also fixes a bug that allowed players to glitch through walls

## 1.1.0
### New features
- The drag ruler will now be colored for other players than the dragging player as well (only if they have at least observer permissions for that token)
- The drag ruler won't be shown to other players if they cannot see the dragged token

### Bugfixes
- Fixed a bug where Drag Ruler wouldn't work at all on some windows installations (specificially where the `foundry.js` has `CRLF` line endings)

## 1.0.1
### Bugfixes
- The GM can now move tokens through walls
- It is now possible to move multiple tokens with Drag Ruler enabled
