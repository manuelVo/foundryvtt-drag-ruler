## In development
### New features
- Right click and spacebar can now be swapped, allowing to place waypoints with right click and removing them with spacebar

### Bugfixes
- Disabling snap to grid now works with shift as expected
- Fixed a bug where the ruler would sometimes jump to a different target location when deleting a waypoint

## v1.1.1
### Bugfixes
- Fixed a bug where tokens wouldn't be moved to the corect end position on gridless maps
- Ruler now appears immediately when the token is being dragged
- On gridless maps the ruler will always start measuring at the center of the token
  - This change has no impact on the distance that is being measured
  - In addition to the cosmetical aspect this also fixes a bug that allowed players to glitch through walls

## v1.1.0
### New features
- The drag ruler will now be colored for other players than the dragging player as well (only if they have at least observer permissions for that token)
- The drag ruler won't be shown to other players if they cannot see the dragged token

### Bugfixes
- Fixed a bug where Drag Ruler wouldn't work at all on some windows installations (specificially where the `foundry.js` has `CRLF` line endings)

## v1.0.1
### Bugfixes
- The GM can now move tokens through walls
- It is now possible to move multiple tokens with Drag Ruler enabled
