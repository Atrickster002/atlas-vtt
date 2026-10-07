## New

- Statblocks show without the Fantasy Statblocks plugin: Atlas draws them itself on token hovers, in the DM screen and in the asset manager

- Statblock templates for 5E (2014 and 2024), Cairn, Draw Steel and Fate, and general ones for creatures, NPCs and hazards

## Improved

- Fog paint and erase strokes now use consistent shapes.

- Simplified how token artwork and collection rules update.

- Simplified token statblock updates and added checks for linked notes.

- Simplified laser pointer updates and added checks for cleanup.

- Added checks to keep data types and rendering helpers independent of plugin services.

- Widget shortcuts are consistently marked as GM controls.

- Dice rolls now reject invalid formulas with a clear message and enforce limits of 64 characters, 10 terms, 100 dice and 1,000 faces per die. Exploding dice keep their existing limit.

- Simplified the hashing behind bundles, library files, thumbnails and dice throws, with checks that keep their results unchanged.

- The creature filter Layout is now called Template. Type `template:` in the search; `layout:` still works

- The token creator finds statblock notes without the Fantasy Statblocks plugin too. Its image source is now called Statblock notes

## Fixed

- Hovering a token whose note holds its statblock in a code block shows the statblock, not the plain note

- Fog now updates correctly when returning to a map or canceling a drawing.

- Erasing part of a drawing now keeps all saved properties on the remaining pieces.

- Closing the command palette cancels its pending focus attempts, so it cannot take focus back afterwards.

- Dice rolls, sounds and history stay in the map view that made them. The player window follows the presented view, and clearing a log leaves other views alone.

## Important changes

- Fog-covered tokens and door badges are now hidden in the player view, including token labels and drag rulers.

- Hidden tokens no longer add sight or explore new areas in the player window. Areas already explored stay remembered.

- Removed an unused legacy map view. Old tabs using it no longer reopen. The current player window is unchanged.

- In the player window, a dice roll shows its token's portrait and ability only when players can see that token in the shown scene, and its name only when token nameplates are shown to players.

- A measurement that starts on a token players can't see is no longer shown in the player view or session view. A measurement also leaves the player view while the token it started on is out of sight.
