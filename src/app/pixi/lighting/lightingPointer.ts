import type { TokenRenderer } from '../TokenRenderer';
import type { DoorIcons } from './DoorIcons';
import type { LightInteraction } from './LightInteraction';
import type { LightZoneEditor } from './LightZoneEditor';
import type { WallEditor } from './WallEditor';

export interface LightingPointerTargets {
  lights: LightInteraction;
  editor: WallEditor;
  zones: LightZoneEditor;
  doors: DoorIcons;
  /** Opens the wall menu at a world point, given also as a screen point. */
  wallMenu: (x: number, y: number, screenX: number, screenY: number) => void;
  /** Opens a door's menu at a screen point. */
  doorMenu: (doorId: string, screenX: number, screenY: number) => void;
}

/**
 * Routes the pointer from the token renderer's dispatch: lights and door badges (a click opens
 * or closes the door, a right-click opens its menu) with any tool;
 * with the lighting tool the walls, or in its zone mode the light zones, which then take every
 * press (a zone is drawn across lights and walls alike).
 */
export function wireLightingPointer(tokens: TokenRenderer, { lights, editor, zones, doors, wallMenu, doorMenu }: LightingPointerTargets): void {
  tokens.setLightHandlers({
    // With the lighting tool, a wall handle is grabbed before the marker beneath it, and Shift draws past lights.
    pointerDown: (x, y, e) => {
      if (zones.active && editor.shown) return false;
      return lights.pointerDown({ x, y }, e, editor.handleAt({ x, y }) || (editor.shown && e.shiftKey && !e.ctrlKey && !e.metaKey));
    },
    cursorAt: (x, y) => (zones.active && editor.shown ? null : lights.cursorAt({ x, y }, editor.handleAt({ x, y }))),
    leave: () => lights.clearHover(),
  });
  tokens.setWallPointerDownHandler((x, y, e) => (zones.active ? zones.pointerDown({ x, y }, e) : editor.pointerDown({ x, y }, e.shiftKey, e.ctrlKey || e.metaKey)));
  tokens.setWallPointerMoveHandler((x, y, e) => (zones.active ? zones.pointerMove({ x, y }, e) : editor.pointerMove({ x, y })));
  tokens.setWallPointerUpHandler(() => {
    zones.pointerUp();
    editor.pointerUp();
  });
  tokens.setWallDoubleClickHandler(() => (zones.active ? zones.doubleClick() : editor.doubleClick()));
  tokens.setWallContextMenuHandler((x, y, screenX, screenY) => {
    if (editor.shown && !zones.active) wallMenu(x, y, screenX, screenY);
  });
  tokens.setWallCursorProvider((x, y) => (zones.active ? zones.cursorAt({ x, y }) : editor.cursorAt({ x, y })));
  tokens.setDoorMenuHandlers({ hitTest: (x, y) => doors.hitTest(x, y), open: doorMenu });
  tokens.setDoorClickHandler((x, y) => {
    const doorId = doors.hitTest(x, y);
    if (doorId) doors.toggle(doorId);
    return !!doorId;
  });
}
