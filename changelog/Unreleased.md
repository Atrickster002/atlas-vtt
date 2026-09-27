## New

**New Feature: Creature Filters**

- Filter your characters in the asset manager by what their linked statblocks say: CR in D&D 5e, level in Pathfinder, Old-School Essentials and Shadowdark, tier and role in Daggerheart, or any other field your statblocks have. The Filters section sits below the tags on the Characters tab.
- Each game system brings its own filters. Choose yours in Collection Settings → Creature Filters, where Atlas lists the fields your statblocks have and how many of them have each.
- Ranges show how many characters have each value and step through exactly those values, so CR moves from 1/4 to 1/2 to 1. Options show how many characters each one would add.
- Filter by whether a character has a statblock, by the statblock's layout and by token size in every collection. Characters without the field you filter by are hidden, and the sidebar says how many.
- Works with statblock notes Fantasy Statblocks has not parsed, such as notes in a vault where its "auto parse" setting is off.

## Improved

- The laser pointer looks like a laser: a glowing beam with a bright core that narrows as it fades, and a round spot at the pointer. It stays visible on light maps, where the old one almost disappeared. Pick its colour and size in the Move tool's menu (the arrow next to it): eight colours that stay distinguishable for colour-blind players, with sky blue, blue and white clear for every kind of colour blindness. It keeps the same size on screen at every zoom level, and Atlas remembers your choice for every map.

## Fixed

- Maps that were already open when Obsidian started now follow settings changes right away, such as trackpad or mouse navigation. Changing player view options on such a map no longer reverts settings you changed elsewhere.
- Atlas follows changes you make to its files outside Atlas, in Obsidian's file explorer, your file manager or through a sync tool. A collection whose folder you rename keeps its scenes, tokens, encounters and settings under the new name. A scene you move into another collection's folder moves to that collection. Scenes, encounters and token art you copy into a collection folder show up in the asset manager, and ones you delete there disappear from it. Before, such changes could leave scenes missing or empty the asset manager.

## Important changes

- A collection's folder now always carries the collection's name, in Atlas and in Obsidian's file explorer alike. Renaming a collection in Atlas renames its folder, and renaming the folder renames the collection. On the first start, Atlas renames existing folders once to match their collections, for example `default` to `5e`. The default collection can be renamed like any other and stays your default collection.
