import { EventEmitter } from 'events';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { WallEditor } from '../../src/app/pixi/lighting/WallEditor';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function setup(): { editor: WallEditor; store: ViewAtlasStore; wall: string } {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `wall-editor-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setActiveTool('wall');
  const wall = store.getState().addWall({ type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 }, closed: true });
  const editor = new WallEditor(viewport, store, new EventEmitter(), () => undefined);
  editor.layer.visible = true;
  cleanup = () => {
    editor.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  return { editor, store, wall };
}

describe('WallEditor', () => {
  it('drags a wall handle while its layer shows', () => {
    const { editor, store, wall } = setup();
    expect(editor.pointerDown({ x: 100, y: 100 }, false, false)).toBe(true);
    editor.pointerMove({ x: 140, y: 160 });
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 140, y: 160 });
  });

  // Whoever hides the layer ends what was under way (`afterVisibilityChange`); the editor itself
  // also takes no pointer while hidden, so a drag cannot go on unseen even before that call.
  it('moves nothing from the moment its layer is hidden', () => {
    const { editor, store, wall } = setup();
    editor.pointerDown({ x: 100, y: 100 }, false, false);
    editor.layer.visible = false;
    editor.pointerMove({ x: 140, y: 160 });
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 100, y: 100 });
    expect(editor.pointerDown({ x: 300, y: 100 }, false, false)).toBe(false);
    expect(editor.cursorAt({ x: 100, y: 100 })).toBe('default');
  });
});
