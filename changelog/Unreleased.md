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

## Fixed

- Auto detect finds the grid of a small map picture, with cells of about ten pixels, where it took four cells for one
- A grid placed with Freehand stays exactly where and as large as you placed it, on maps with a printed grid too

## Important changes

- The arrow keys no longer nudge a grid while it is being aligned
