## New

- Dice rolls are thrown as 3D dice in a panel at the top right of the map (top centre in the player window): they bounce off the panel's edges, clatter, spark when they land, and a modifier clicks onto the total. Click a roll or press Escape to dismiss it. Critical results get a bigger burst of sparks and their own sound. Rolls with dice that have no real shape (such as d7) still show as a result card. Choose between result cards, fast dice and dice under Settings → Dice or in the command palette's new Dice settings. The player window shows the same dice when it shows rolls
- Cairn is a built-in game system preset, with 5-foot squares and its conditions: Deprived, Fatigue, Critical Damage, Paralyzed, Delirious and Fleeing
- Each collection has dice rules in its settings (new Dice tab): the default roll and how critical results are recognised (natural, roll-under, doubles or none). A bare bonus in a statblock, such as +3, now rolls with the collection's default roll, e.g. 1d10+3 in Cyberpunk RED. Every game system preset sets them

## Improved

- The dice tray (R) shows drawn dice, has a modifier you can step up and down, and always shows the formula it will roll. Take a die back with the − under it
- Large token imports are much faster. 1,000 tokens from Fantasy Statblocks now take about 40 seconds instead of 11 minutes, and imports of thousands of tokens no longer slow down as they go
- The token creator and the Fantasy Statblocks list stay smooth with thousands of images
- Statblocks that share one image read and convert it only once

## Fixed

- Collections can be deleted again when some of their files were already removed outside Obsidian, for example by git
- The description and steps boxes of the issue report form no longer slide under the rows below them in a short window, such as the settings window. The form scrolls instead
- "Link Statblock" now finds every statblock note the token creator finds, including notes that define their statblock in a statblock code block (such as `monster: Octopus`)
- Right-clicking a token under fog of war opens the token's menu instead of the fog menu, and the fog and text menus open at the pointer instead of shifted up and to the left
- Starting a circle measurement no longer stops the map from drawing when Obsidian runs without hardware acceleration, so tokens and encounters added afterwards show up again
- Spawn on Map and Spawn Multiple now work in the asset manager opened from the scene browser, the dashboard or a command: tokens and encounters go to the open scene, and when no scene is open Atlas says so instead of doing nothing
- You can create a scene from the asset manager's Create menu (+) and by right-clicking a map. Before, a scene could only be made by double-clicking a map, which nothing pointed to
- The dice tray no longer shows on top of the asset manager and the DM dashboard
- A roll such as d20+2d6 no longer adds a stray +2 to its total, and subtracted dice (2d6-1d4) now subtract
- A natural 1 or 20 counts as critical even when a modifier is added, and a maxed damage die never does
