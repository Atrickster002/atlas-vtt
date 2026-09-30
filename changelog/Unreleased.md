## New

- Cairn is a built-in game system preset, with 5-foot squares and its conditions: Deprived, Fatigue, Critical Damage, Paralyzed, Delirious and Fleeing

## Improved

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
