## New

**New Feature: Creature Filters**

- Filter your characters in the asset manager by what their linked statblocks say: challenge rating, level, tier, type, traits, rarity, alignment and source, whatever game system they come from. Atlas offers the filters your statblocks have, so a D&D 5e statblock gives challenge rating and a Pathfinder or Old-School Essentials one level.
- Type filters into the search: `type:beast`, `cr:1-3`, `cr>=5`, `tag:forest` or `statblock:no`. Suggestions list the filters and the values your characters have with their counts; Tab or Enter completes them.
- Or open the filter panel with the button at the end of the search: ranges show how many characters have each value and step through exactly those values, so challenge rating moves from 1/4 to 1/2 to 1. Options show how many characters each one would add.
- Exclude with a double-click on an option (or Alt-click), or type `-type:beast`: the chip reads "not beast" and hides every beast. Click it again to clear it.
- Alignment filters by its parts, Lawful, Neutral, Chaotic, Good, Evil, Unaligned and Any, instead of every way a statblock words it. Pick Chaotic and Evil to find chaotic evil creatures.
- Every active filter shows as a chip above your characters; click one to remove it, or Reset to clear them all. Filters with several values fold into one chip that lists them.
- Press Cmd+F (Ctrl+F on Windows and Linux) in the asset manager to jump to the search.
- Sort characters by Rating: challenge rating, level or tier, whichever their statblock has.
- In Collection Settings → Creature Filters, switch off filters a collection does not need, or add filters on other fields of your statblocks. Atlas lists the fields it finds and how many statblocks have each.
- Works with statblock notes Fantasy Statblocks has not parsed, such as notes in a vault where its "auto parse" setting is off.

**New Feature: Loot Roller**

- Roll random loot from your own item notes, gathered with Obsidian Bases. Add bases to a collection in Collection Settings → Loot; every note a base's views list is an item. The Bases core plugin must be turned on.
- Open the loot roller with L, the coin button in the toolbar or the command palette. It floats over the map; drag it anywhere and resize it from its edges. Each map remembers its place, size, views and latest roll.
- Tick the bases to roll from on the left, or open a base to pick single views. Roll one item or up to ten at once. An item in several ticked views counts once.
- Every item of the ticked views has an equal chance. Switch rarities on and off to roll, say, only Common and Uncommon items.
- Results show the item's price, description and the other columns of its view, under the names the base gives them. Click a result's source to open the item's note. Name the collection's currency in its settings and plain-number prices read as, say, "500 gold".
- Items with Type and Rarity properties show what each item is and colour it by rarity, like in games: Common, Uncommon in green, Rare in blue, Epic in purple and Legendary in orange.
- Hand items to your players: the eye button on an item shows it with its price in a large "Loot received" window at the top of the player view, easy to read from across the table. Show one item after another and they stack; players close the window by clicking outside it or pressing Escape.
- The History tab keeps every roll made in the collection, from any of its maps, with when and where it was rolled.

## Improved

- The laser pointer looks like a laser: a glowing beam with a bright core that narrows as it fades, and a round spot at the pointer. It stays visible on light maps, where the old one almost disappeared. Pick its colour and size in the Move tool's menu (the arrow next to it): eight colours that stay distinguishable for colour-blind players, with sky blue, blue and white clear for every kind of colour blindness. It keeps the same size on screen at every zoom level, and Atlas remembers your choice for every map.

## Fixed

- Maps that were already open when Obsidian started now follow settings changes right away, such as trackpad or mouse navigation. Changing player view options on such a map no longer reverts settings you changed elsewhere.
- Atlas follows changes you make to its files outside Atlas, in Obsidian's file explorer, your file manager or through a sync tool. A collection whose folder you rename keeps its scenes, tokens, encounters and settings under the new name. A scene you move into another collection's folder moves to that collection. Scenes, encounters and token art you copy into a collection folder show up in the asset manager, and ones you delete there disappear from it. Before, such changes could leave scenes missing or empty the asset manager.
- A scene whose map file was moved or renamed while it was closed opens with its fog of war, walls, lights, initiative and widgets. Before, it opened with only its tokens, pins, texts and drawings and lost the rest on the next save. Initiative portraits and dice rolls also follow moved token art now.
- On macOS, Cmd-hover previews of statblocks and notes open with Cmd only, no longer with Ctrl. Ctrl-click is a right click there, so dice clicked with Ctrl held did not roll. A statblock preview can no longer get stuck on screen, where releasing the key, reopening it or switching scenes would not close it.

## Important changes

- A collection's folder now always carries the collection's name, in Atlas and in Obsidian's file explorer alike. Renaming a collection in Atlas renames its folder, and renaming the folder renames the collection. On the first start, Atlas renames existing folders once to match their collections, for example `default` to `5e`. The default collection can be renamed like any other and stays your default collection.
