import { EventEmitter } from 'events';
import { expect, it } from 'vitest';
import { Container, Sprite, type Graphics } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';

it('draws the selection frame around the wheels on both sides of the token and the bars below it', () => {
  const group = new Container();
  const sprite = group.addChild(new Sprite());
  sprite.width = 70;
  sprite.height = 70;
  group.position.set(100, 100);
  const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }) => point });
  const store = createStore(subscribeWithSelector(() => ({
    selectedIds: ['goblin'], activeTool: 'select', selectionMode: 'box',
    objects: { tokens: { goblin: { id: 'goblin' } }, drawings: {} },
  })));
  const manager = new SelectionManager(viewport as never, () => ({ goblin: group }), () => ({}), store as never, new EventEmitter());
  manager.resourcesExtentProvider = () => ({ below: 24, right: 30, left: 30, above: 0 });

  manager.updateSelectionOverlay();

  const { minX, maxX, maxY } = (manager.getPlayerViewLayers()[0]!.layer as Graphics).bounds;
  const reach = 35 + 30;
  expect(100 - minX).toBeGreaterThan(reach);
  expect(100 - minX).toBeCloseTo(maxX - 100);
  expect(maxY - 100).toBeGreaterThan(35 + 24);
});
