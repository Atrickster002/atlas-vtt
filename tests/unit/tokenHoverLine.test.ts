import { afterEach, describe, expect, it } from 'vitest';
import { Text, type Container, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { UIManager } from '../../src/app/pixi/token-renderer/UIManager';
import { createViewAtlasStore, type TokenInput, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { HP } from '../mocks/resourceFixtures';

/** Where the GM's line on the token hover card shows, and where it cannot. */

const NOTE = 'Darkness · Not seen by the players';

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function texts(root: Container): string[] {
  const found: string[] = [];
  const walk = (node: Container, shown: boolean): void => {
    const visible = shown && node.visible && node.renderable;
    if (node instanceof Text && visible && node.text) found.push(node.text);
    node.children.forEach((child) => walk(child, visible));
  };
  walk(root, true);
  return found;
}

function makeStore(): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `hover-line-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/review.atlasmap');
  return store;
}

describe('the GM line on the token hover card', () => {
  it('shows on a hovered token that has a bar', () => {
    const restore = stubJsdomGraphics();
    const store = makeStore();
    const ui = new TokenUIRenderer(store);
    cleanup = () => { ui.destroy(); restore(); };
    ui.resourceDefsProvider = () => [HP];
    ui.sightLineProvider = () => NOTE;
    ui.update({ id: 't', kind: 'character', name: 'Goblin', resources: { hp: { current: 5, max: 7 } } } as never, 62);
    ui.setHoverState(true);
    expect(ui.getContainer().visible).toBe(true);
    expect(texts(ui.getContainer())).toContain(NOTE);
  });

  it('shows on a hovered token without bars, nameplate or conditions, whose UI is otherwise hidden, and goes with the hover', () => {
    const restore = stubJsdomGraphics();
    const store = makeStore();
    const ui = new TokenUIRenderer(store);
    cleanup = () => { ui.destroy(); restore(); };
    ui.resourceDefsProvider = () => [HP];
    let note: string | null = NOTE;
    ui.sightLineProvider = () => note;
    // The default map shows no nameplates; a token without a statblock has no hit points.
    expect(store.getState().tokenSettings.showNameplates).toBe(false);
    ui.update({ id: 't', kind: 'character', name: 'Goblin' } as never, 62);
    expect(ui.getContainer().visible).toBe(false);
    ui.setHoverState(true);
    expect(ui.getContainer().visible).toBe(true);
    expect(ui.showsContent).toBe(true);
    expect(texts(ui.getContainer())).toEqual([NOTE]);
    // Another update of the token keeps the open card.
    ui.update({ id: 't', kind: 'character', name: 'Goblin', x: 5 } as never, 62);
    expect(texts(ui.getContainer())).toEqual([NOTE]);
    // The line goes (the canvas shows the players' view): nothing is left to show.
    note = null;
    ui.refreshSightLine();
    expect(ui.getContainer().visible).toBe(false);
    note = NOTE;
    ui.refreshSightLine();
    expect(ui.getContainer().visible).toBe(true);
    ui.setHiddenWithToken(true);
    expect(ui.getContainer().visible).toBe(false);
    ui.setHiddenWithToken(false);
    ui.setHoverState(false);
    expect(ui.getContainer().visible).toBe(false);
    expect(ui.showsContent).toBe(false);
  });

  it('never reaches the players\' copies of the token UI, and the GM\'s UI is hidden in their frame', () => {
    const restore = stubJsdomGraphics();
    const store = makeStore();
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
    const manager = new UIManager(viewport, store);
    cleanup = () => { manager.destroy?.(); viewport.destroy(); restore(); };
    const id = store.getState().addToken({ kind: 'character', name: 'Goblin', imagePath: 'g.png', x: 100, y: 100, size: 1, conditions: ['x'] } as TokenInput);
    const token = store.getState().objects.tokens[id] as TokenEntity;
    const sprite = { position: { x: 100, y: 100 }, visible: true, tokenSize: 62, width: 62 };
    (manager as unknown as { getTokenSprite: (id: string) => unknown }).getTokenSprite = () => sprite;
    const ui = manager.createTokenUI(id, sprite as never, token)!;
    manager.setSightLineProvider(() => NOTE);
    ui.resourceDefsProvider = () => [HP];
    ui.update({ ...token, resources: { hp: { current: 5, max: 7 } } } as never, 62);
    manager.setHoverState(id);
    expect(texts(manager.getUIContainer())).toContain(NOTE);
    const layers = manager.getPlayerViewLayers({ showTokenNameplates: true });
    expect(layers).toContainEqual({ layer: manager.getUIContainer(), visible: false });
    const players = layers.find(({ layer, visible }) => visible && layer !== manager.getUIContainer())!.layer as Container;
    players.visible = true;
    expect(texts(players)).not.toContain(NOTE);
    // A thumbnail is the GM's picture: it shows the GM's token UI, and with it an open hover card.
    expect(manager.getGmViewLayers()).toContainEqual({ layer: manager.getUIContainer(), visible: true });
    expect(manager.getGmViewLayers()).toContainEqual({ layer: ui.getContainer(), visible: true });
    expect(texts(manager.getUIContainer())).toContain(NOTE);
  });
});
