## New

- Dynamic lighting. Switch it on per scene from the new Lighting tool and pick the time of day, from daylight to pitch black. Players see only what their tokens can see: walls always block their line of sight, and in the dark they see only what light reaches.
- Place candles, torches, lanterns and magical lights on the map, or hand one to a token from its right-click menu so it moves with the token. Light never passes a wall, flames cast soft shadows that widen with the flame's size, light bounces softly off floors and walls, and each flame glows and flickers.
- Give tokens vision from their right-click menu, and set a sight range and darkvision in Edit Token. Darkvision shows the dark in grey.
- Give a token a vision cone in Edit Token, from a narrow beam to a wide sweep. It faces the way the token is turned, and the edges of the cone are sharp.
- Give a token tremorsense. Players see tokens within its range through walls and in the dark, but not the map itself.
- Set a default vision per collection, in a new Vision tab of the collection settings: sight range, darkvision, tremorsense and cone. Tokens you place from the library start with it, with vision still switched off, and a game system can bring its own defaults.
- Open Lighting settings from the lighting menu to adjust a scene: switch token vision off so players see everything the light shows, stop remembering explored areas (what was already explored comes back when you switch it on again), pick the colours of explored and unexplored areas, and choose from which brightness a scene counts as lit.
- Tint a scene's ambient light with the colour swatch next to the Ambient light slider in the lighting menu.
- Areas the players have explored stay on their screen, dim and grey, and are saved with the scene. Forget them from the Lighting tool's menu.
- The GM sees the whole map with its lighting. Hold H, or switch on Preview player view, to see exactly what the players see.
- Open and close doors by clicking the door badges, with any tool.
- Double-click a light, or right-click it, to change its kind, colour, range, brightness, softness and flicker.
- Dice rolls are thrown as 3D dice in a panel at the top right of the map (top centre in the player window): they bounce off the panel's edges, clatter, spark when they land, and a modifier clicks onto the total. Click a roll or press Escape to dismiss it. Critical results get a bigger burst of sparks and their own sound. Rolls with dice that have no real shape (such as d7) still show as a result card. Choose between result cards, fast dice and dice under Settings → Dice or in the command palette's new Dice settings. The player window shows the same dice when it shows rolls
- Cairn is a built-in game system preset, with 5-foot squares, d20 saves where a 1 always succeeds and a 20 always fails, and its conditions: Deprived, Fatigue, Critical Damage, Paralyzed, Delirious and Fleeing
- Each collection has dice rules in its settings (new Dice tab): the default roll and how critical results are recognised (natural, roll-under, doubles or none). A bare bonus in a statblock, such as +3, now rolls with the collection's default roll, e.g. 1d10+3 in Cyberpunk RED. Every game system preset sets them

## Improved

- Choose how the dice look in the command palette's Dice settings: light card, dark with light numbers, or your Obsidian accent colour (the numbers turn dark or light to stay readable), each shown as a d20. Sci-fi numbers suit futuristic games; the choice also sets the font of roll totals
- The dice tray (R) shows drawn dice, has a modifier you can step up and down, and always shows the formula it will roll. Take a die back with the − under it
- Large token imports are much faster. 1,000 tokens from Fantasy Statblocks now take about 40 seconds instead of 11 minutes, and imports of thousands of tokens no longer slow down as they go
- The token creator and the Fantasy Statblocks list stay smooth with thousands of images
- Statblocks that share one image read and convert it only once
- In the GM view, every light shines at full strength and a faint icon marks every light; areas no token sees are shown slightly faded instead of dimmed
- Flickering lights take about a quarter of the graphics card time they did on a 120 Hz display, and half on a 60 Hz one
- Dynamic lighting costs far less on high-density displays such as Retina screens, so panning a lit map stays smooth
- An open player window costs far less, so the GM view stays smooth on large maps with lighting

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
- Edit Token opens again instead of crashing on its Vision switch
