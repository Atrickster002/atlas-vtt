## New

- Campaigns on the dashboard: make and search them, play one to note the scenes it uses, and see the player characters who stood on its last scene
- Player characters: right-click a character on the map or in the asset manager to make it one; they have a tab of their own in the asset manager, beside the other characters
- A campaign you play keeps one set of numbers for each player character: hit points and the other values changed on one scene show on every scene of the campaign, and travel with its folder to your other devices
- Make tokens and maps from images already in your vault: the token and map creators have a From vault tab, and your files stay where they are
- Dice formulas take the notation Foundry, Roll20 and Dice Roller share: advantage as 2d20kh1, keep and drop, rerolls (r1, ro<2, rr1), x explosions, success counts (cs>=5), d%, Fate dice (dF), labels like 2d6[fire], and * / with brackets. Dropped and rerolled dice show struck through
- Statblocks show without the Fantasy Statblocks plugin: Atlas draws them itself on token hovers, in the DM screen and in the asset manager
- Statblock templates for 5E (2014 and 2024), Cairn, Draw Steel and Fate, and general ones for creatures, NPCs and hazards
- A template can limit a value to a list of choices, picked from a dropdown: one, several, or several each with a number, like senses or movement
- A value can stand in a box, its label small over a large number, like hit points or thresholds in a printed stat block. Boxed values side by side join into one strip: set a value's Label to Boxed in the template editor

## Improved

- The initiative card's edit dialog takes a modifier of your own for a combatant, which counts instead of its statblock's until you clear it
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
- The creature filter Layout is now called Template. Type `template:` in the search; `layout:` still works
- The token creator finds statblock notes without the Fantasy Statblocks plugin too. Its image source is now called Statblock notes

## Fixed

- Rolling initiative adds each creature's modifier from its linked statblock, read from a field you pick in the collection's settings, or from an ability score such as DEX (D&D 5e reads Initiative, else DEX). With a contribution by anacletoTM
- Auto detect finds the grid of a small map picture, with cells of about ten pixels, where it took four cells for one
- A grid placed with Freehand stays exactly where and as large as you placed it, on maps with a printed grid too
- The note picker of a pin and the right-click menus of pins and drawings open beside them, with Obsidian's left sidebar open too
- Hovering a token whose note holds its statblock in a code block shows the statblock, not the plain note
- Measured distances show one decimal place, so a 1.5 m cell reads 1.5 m instead of 2 m
- The fog brush paints and reveals an even stroke while you drag it, where a slow stroke showed a pattern of half-covered dots until it was let go
- Saving an encounter from the asset manager or scene browser asks for its name in front of it, where the dialog opened behind it
- Cmd+A (Ctrl+A) in a text field of the asset manager, such as the rename field, selects its text instead of every asset
- Creating maps, tokens and scenes offers only the tags of the chosen collection, no longer tags deleted from it or kept by other collections
- A fixed value such as an armour class shows on its token when it is 0, and follows its statblock down to 0
- A ring colour picked from a token's right-click menu colours every selected token, in one undo step
- Resource wheels that players may see now show in the player window and in session view, and every resource, wheels too, has its switch in the player view settings
- On a lit scene, the light and sight of a token that glides to a new place, such as after an undo, move with the token instead of arriving before it. A token whose way crosses a wall is put in its place at once

## Important changes

- The arrow keys no longer nudge a grid while it is being aligned
