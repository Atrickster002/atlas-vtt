## Improved

- The toolbar at the bottom of the map now fits any window size. When the map view gets too narrow, the tools you need least move into a "More tools" menu at the end of the toolbar, and they come back as soon as there is room again. The tool you are using always stays in the toolbar.
- Tool menus, the dice tray and the command palette stay inside small map views: they shift away from the edge and scroll when the view is too short for them.
- Creating tokens and maps is much faster, and Obsidian stays responsive while it runs. Images are converted in the background on several processor cores at once and each image is read only once, so importing creatures from Fantasy Statblocks takes a fraction of the time.
- Map and token images that are already WebP and within the size limit keep their original file instead of being compressed again, so they lose no quality.

## Fixed

- Maps and scenes move into folders in the asset manager, by drag and drop or with Move to Folder.
- Scenes keep their background when the map image behind it is renamed or moved.
- Imported maps no longer open as a black canvas from the dashboard. The dashboard listed map images among your recent scenes, and opening one showed an empty map. It now lists only scenes; to play on a map, create a scene from it in the asset manager. Maps you already opened this way no longer come back as scene tabs.
- A scene that cannot be opened now says why, instead of leaving an empty black canvas.
- A token's image can be moved and zoomed again after turning its ring on, and Edit token saves the new framing even without a new image. Tokens already on your maps show the change right away.
- Maps show up when Obsidian cannot use your graphics card, for example on some Linux systems with Wayland or with hardware acceleration turned off. The canvas used to stay empty; Atlas now draws without the graphics card, with outlines, glows and some effects missing, and tells you how to turn hardware acceleration back on.
- The laser pointer works again after closing a map view. Until Obsidian restarted, it drew nothing in every map view opened afterwards.
