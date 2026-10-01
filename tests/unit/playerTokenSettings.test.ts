import { expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { UIManager } from '../../src/app/pixi/token-renderer/UIManager';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';

// Text rasterization requires a GPU/canvas; keep the real display tree and UI manager.
vi.mock('../../src/app/pixi/TokenUIRenderer', async () => {
  const { Container } = await import('pixi.js');
  return { TokenUIRenderer: class {
    container = new Container();
    update = vi.fn();
    destroy = vi.fn();
    sightLineProvider: ((tokenId: string) => string | null) | null = null;
    refreshSightLine = vi.fn();
    setHoverState = vi.fn();
    getContainer() { return this.container; }
  } };
});

it('renders separate player token overlays using the player settings and restores the DM layers', () => {
  const viewport = new Container();
  const token = { id: 'hero', kind: 'character', name: 'Hero', hp: 10, stress: 3 };
  const store = createStore(() => ({ grid: { size: 70 }, objects: { tokens: { hero: token } } }));
  const manager = new UIManager(viewport as any, store as any, 'test', true);
  const sprite = new Container(); sprite.position.set(100, 200);
  manager.setTokenSpriteProvider(() => sprite);
  manager.createTokenUI('hero', sprite, token as any);
  const settings = { showTokenHP: true, showTokenStress: false, showTokenNameplates: true };
  const layers = manager.getPlayerViewLayers(settings);
  const playerLayer = layers.find(entry => entry.visible)!.layer as Container;
  captureWithLayerVisibility(layers, () => {}, () => {
    expect(manager.getUIContainer().visible).toBe(false);
    expect(playerLayer.visible).toBe(true);
    expect(playerLayer.children[0]?.position).toMatchObject({ x: 100, y: 200 });
  });
  expect(manager.getUIContainer().visible).toBe(true);
  expect(playerLayer.visible).toBe(false);
  manager.getPlayerViewLayers({ ...settings, showTokenHP: false });
  expect(playerLayer.children).toHaveLength(1);
  manager.destroyTokenUI('hero');
  expect(playerLayer.children).toHaveLength(0);
  manager.destroyAll();
});

it('gives the GM\'s token UI the line of its hover card, never the players\' copy, and refreshes the card of the hovered token', () => {
  interface FakeUI { sightLineProvider: ((tokenId: string) => string | null) | null; refreshSightLine: ReturnType<typeof vi.fn> }
  const viewport = new Container();
  const token = { id: 'hero', kind: 'character', name: 'Hero' };
  const store = createStore(() => ({ grid: { size: 70 }, objects: { tokens: { hero: token } } }));
  const manager = new UIManager(viewport as never, store as never, 'test', true);
  const sprite = new Container();
  manager.setTokenSpriteProvider(() => sprite);
  manager.createTokenUI('hero', sprite, token as never);
  manager.getPlayerViewLayers({ showTokenHP: true, showTokenStress: true, showTokenNameplates: true });
  const { tokenUIs, playerTokenUIs } = manager as unknown as { tokenUIs: Record<string, FakeUI>; playerTokenUIs: Record<string, FakeUI> };

  // Before a provider is set there is no line; a UI made before it takes it all the same.
  expect(tokenUIs.hero!.sightLineProvider?.('hero')).toBeNull();
  const refresh = manager.setSightLineProvider((id) => `Darkness · ${id}`);
  expect(tokenUIs.hero!.sightLineProvider?.('hero')).toBe('Darkness · hero');
  expect(playerTokenUIs.hero!.sightLineProvider).toBeNull();

  refresh();
  expect(tokenUIs.hero!.refreshSightLine).not.toHaveBeenCalled();
  manager.setHoverState('hero');
  refresh();
  expect(tokenUIs.hero!.refreshSightLine).toHaveBeenCalledTimes(1);
  expect(playerTokenUIs.hero!.refreshSightLine).not.toHaveBeenCalled();
  manager.setHoverState(null);
  refresh();
  expect(tokenUIs.hero!.refreshSightLine).toHaveBeenCalledTimes(1);
  manager.destroyAll();
});
