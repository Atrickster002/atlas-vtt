# Atlas add-ons

Each folder here is one feature that sits on top of Atlas core (upstream Atlas VTT plus a small set of hooks) without editing it.

- **Add an add-on:** create `src/addons/<name>/addon.ts` and default-export an `AtlasAddon` (`src/app/addons/AtlasAddon.ts`). The build finds it on its own, so there is no list to edit.
- **Remove an add-on:** delete its folder. Core builds, loads and passes its tests without any add-on.
- **Branches:**
  - `atlas/core-addons` is core with the hook points.
  - `addon/<name>` is that core plus one add-on.
  - `atlas/main` has them all.

  Merging an add-on branch only adds its folder, so add-on branches don't conflict with each other.
- **Tests:**
  - Each add-on keeps its own in `__tests__/`. They run with vitest and, like `tests/unit`, are not type-checked.
  - Core tests that would change with an add-on installed switch add-ons off with `vi.mock('…/addons/addonRegistry', () => ({ installedAddons: () => [] }))`.

## Hooks (all optional)

Contract: `src/app/addons/AtlasAddon.ts`, plus the area files in `src/app/addons/hooks/`.

| Area | Hook | What it does |
|---|---|---|
| Plugin | `onload` / `onunload`, `settingsSections` | Registers views, commands and settings. Settings are stored with `settingsService.get/setAddonSettings(key)`. |
| Store | `store` | Adds per-scene state and actions. `persist` chooses what is saved in the `.atlasmap` file and `restore` checks it on load. Types come in through `declare module 'src/app/addons/AtlasAddon' { interface AddonStateRegistry { '<id>': MySlice } }`. An add-on increases `addonRevision` when a setting its hooks read changes, so pins redraw. |
| Objects | object mask | Calls `setObjectMask('<id>', { hidden, ghost })` to hide objects or show them faintly. Pins, tokens, texts, drawings, hex links and selection respect it, and players never see ghosts. |
| Objects | `objectMenuEntries` | Adds entries to the context menu of pins, tokens, texts and drawings. Gets the zoom and the app. |
| Pins | `pinSearchEntries`, `pinScale`, `pinVisible` | Extra results in the pin tool's search, a pin's size, and who sees it at which zoom. |
| Drawings | `drawingShapes`, `keepMeasurement` | New drawing types (add the name to `DrawingTypeRegistry`), and keeping finished measurements on the map. |
| UI | `ToolbarAbove`, `MapOverlay`, `viewActionEntries`, `backgroundOverride` | A bar above the toolbar, a layer over the map, entries in the map's More options menu, and swapping the map image. |
| Canvas | `createRenderer` | Adds canvas parts for each view, plus layers the player frame must hide (or scale). |

New fields on core types are added with `declare module 'src/app/types'` inside the add-on.

## Installed

| Add-on | What it adds |
|---|---|
| `world-time` | Calendar, viewing date bar (top, bottom, left or right, switchable in More options), objects that exist only at certain dates, map variants, world events and the timeline pane. |
| `pins` | Pins that grow and shrink with the map, zoom ranges, pins shown to players, and creating the note a new pin links to (in the folder set under Settings → Pins). |
| `area-templates` | Kept measurements become cones and circles on the map. |
