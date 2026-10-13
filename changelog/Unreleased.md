## New

- Campaigns on the dashboard: make and search them, play one to note the scenes it uses, and see the player characters who stood on its last scene
- Player characters: right-click a character on the map or in the asset manager to make it one; they have a tab of their own in the asset manager, beside the other characters
- A campaign you play keeps one set of numbers for each player character: hit points and the other values changed on one scene show on every scene of the campaign, and travel with its folder to your other devices
- Dice formulas take the notation Foundry, Roll20 and Dice Roller share: advantage as 2d20kh1, keep and drop, rerolls (r1, ro<2, rr1), x explosions, success counts (cs>=5), d%, Fate dice (dF), labels like 2d6[fire], and * / with brackets. Dropped and rerolled dice show struck through
- Animated maps: add a WebM or MP4 video in the map creator or drop it on the asset manager, and it plays on the map and in the player window while someone sees it. Switch Animate maps off in Atlas' settings to show their first frame instead

## Improved

- The Spectral Engine, which detects a map's grid, shows the grid being found: it is etched into the map along the map's own lines, sharpens as the search grows sure of it, and settles as its glow fades
- A new scene shows its map at once and finds its grid in front of you, where a loading screen covered both before
- Tables that play without a grid can switch off Detect grid on new scenes in the command palette's grid settings: new scenes then have no grid and nothing snaps
- Snapping follows the grid: it is off on a map where no grid was found, and on as soon as a grid is detected or aligned by hand
- A simpler alignment panel: Auto detect finds the grid, measuring by hand asks for one cell where it used to ask for four, and the switch for fitting to the map's lines is gone, since it is always done
- The alignment panel keeps its size whatever you choose: what to click next stands in a note below it, and Auto detect shows its work as light passing through its own button
- The alignment panel opens with the whole map in view: nothing is dimmed or zoomed until you choose to measure or place the grid by hand
- Grid detection no longer freezes the window while it runs. Closing the panel under a running detection lets it finish and takes the grid it finds, which one undo takes back
- The camera glides between the areas of a measurement instead of jumping
- Alignment marks and the grid preview use the theme's accent colour, and marks keep their size at every zoom
- Atlas' messages at the edge of the window take the look of its panels in your theme, where they were Obsidian's dark box
- Several tokens can share one statblock, for colour variants of a creature or NPCs of one kind: linking another token keeps the first, and the DM screen shows them as one statblock
- A statblock keeps its own picture: linking a token sets it only where the statblock has none, and a token copied to another collection keeps its statblock

## Fixed

- Auto detect finds the grid of a small map picture, with cells of about ten pixels, where it took four cells for one
- A grid placed with Freehand stays exactly where and as large as you placed it, on maps with a printed grid too
- The note picker of a pin and the right-click menus of pins and drawings open beside them, with Obsidian's left sidebar open too

## Important changes

- The arrow keys no longer nudge a grid while it is being aligned
