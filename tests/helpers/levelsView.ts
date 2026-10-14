import { EventEmitter } from 'events';
import { Application, CanvasSource, Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { NO_STRETCH } from '../../src/app/grid/mapStretch';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { RenderScheduler } from '../../src/app/pixi/RenderScheduler';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import type { BelowMapImage } from '../../src/app/pixi/lighting/levels/BelowLevel';
import type { BelowLevelsHost } from '../../src/app/pixi/lighting/levels/LevelsBelow';
import type { TokenArt } from '../../src/app/pixi/lighting/levels/BelowTokens';
import type { FogCover } from '../../src/app/vision/throughSight';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** The scene's two floors: the view looks at the upper one and down into the ground floor. */
export const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'ground.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'upper.png' },
];

/** A canvas texture of `width` × `height` px, every pixel coloured by `paint`. */
export function paintedTexture(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const o = (y * width + x) * 4;
      image.data.set([r, g, b, 255], o);
    }
  }
  context.putImageData(image, 0, 0);
  return new Texture({ source: new CanvasSource({ resource: canvas }) });
}

/** A map image of a level below that shows `texture` over `width` × `height` world pixels at once: no tiles to wait for. */
export function fakeBelowImage(texture: Texture, width: number, height: number): BelowMapImage {
  const layer = new Container({ label: 'map-image-below' });
  const sprite = new Sprite(texture);
  sprite.setSize(width, height);
  layer.addChild(sprite);
  return {
    layer,
    worldRect: { x: 0, y: 0, width, height },
    mapStretch: NO_STRETCH,
    load: () => Promise.resolve(),
    setStretch: () => undefined,
    drawFor: () => () => undefined,
    addDemandRegion: () => () => undefined,
    destroy: () => layer.destroy({ children: true }),
  };
}

export interface LevelsViewOptions {
  /** The map's side in world pixels, the view's and the level below's alike. */
  map: number;
  /** The canvas' side in points. */
  pane: number;
  resolution?: number;
  /** What the viewed level's map and the level below's look like; a white floor above and a magenta noise below by default. */
  viewed?: Texture;
  below?: Texture;
  /** The art of every token below; a cyan disc by default. */
  tokenArt?: Texture;
  /** The committed fog of the viewed level. */
  viewedFog?: () => FogCover;
}

export interface LevelsView {
  app: Application;
  viewport: Viewport;
  store: ViewAtlasStore;
  controller: LightingController;
  /** Runs `count` display frames: the lighting's work and the renders it asks for. */
  displayFrames(count: number): void;
  /** Lets what loads on its own come in (a level's map image, a decoded memory), then runs a few display frames. */
  settle(): Promise<void>;
  /**
   * The players' frame of the canvas' size through camera (`scale`, `x`, `y`), as the player
   * window's is drawn (`withPlayerSafeFrame`): players' layers, the levels below prepared for it,
   * one render into a texture, read back top row first.
   */
  playerFrame(scale: number, x: number, y: number): Uint8ClampedArray;
  /** The GM's canvas through the camera, drawn as the render scheduler draws it, read back. */
  gmCanvas(scale: number, x: number, y: number): Uint8ClampedArray;
  dispose(): void;
}

/** Magenta noise: the level below's own hue, which nothing of the viewed level ever has. */
export function belowNoise(map: number): Texture {
  return paintedTexture(map, map, (x, y) => {
    const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const v = 140 + (n % 100);
    return [v, 30 + (n % 20), v];
  });
}

/**
 * A map view of the upper floor with its real `LightingController` (engine, levels below, eraser)
 * on a real renderer, as far as its lighting and its levels below go. The map images are
 * sprites, the tokens below take one art: nothing loads from the vault.
 */
export async function openLevelsView({ map, pane, resolution = 1, viewed, below, tokenArt, viewedFog }: LevelsViewOptions): Promise<LevelsView> {
  const app = new Application();
  await app.init({ width: pane, height: pane, resolution, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x000000, useBackBuffer: true });
  const scheduler = new RenderScheduler(app);
  const viewport = new Viewport({ screenWidth: pane, screenHeight: pane, worldWidth: map, worldHeight: map, events: app.renderer.events });
  viewport.sortableChildren = true;
  const floor = new Sprite(viewed ?? Texture.WHITE);
  floor.setSize(map, map);
  viewport.addChild(floor);
  app.stage.addChild(viewport);
  const obsApp = createInMemoryApp().app;
  const store = createViewAtlasStore(obsApp, `levels-view-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/levels.atlasmap');
  const belowArt = below ?? belowNoise(map);
  const art = tokenArt ?? Texture.WHITE;
  const tokens: TokenArt = { acquire: () => Promise.resolve(art), release: () => undefined, destroyAll: () => undefined };
  const host: BelowLevelsHost = {
    createMapImage: () => fakeBelowImage(belowArt, map, map),
    mapSource: () => ({ kind: 'none', width: map, height: map }),
    createArt: () => tokens,
    viewedFog: viewedFog ?? ((): FogCover => undefined),
    placeEraser: (eraser) => viewport.addChildAt(eraser, viewport.getChildIndex(floor) + 1),
  };
  const controller = new LightingController({
    viewport, app, store, eventBus: new EventEmitter(), obsApp, viewId: 'levels-view',
    bounds: () => ({ width: map, height: map }), albedo: () => null, below: host,
  });
  const ignore = (): void => undefined;
  controller.wire({
    setLightHandlers: ignore, setWallPointerDownHandler: ignore, setWallContextMenuHandler: ignore, setWallPointerMoveHandler: ignore,
    setWallPointerUpHandler: ignore, setWallDoubleClickHandler: ignore, setWallCursorProvider: ignore, setDoorMenuHandlers: ignore,
    setDoorClickHandler: ignore, setPlayerSightProvider: ignore, setGlideWay: ignore, refreshPlayerSight: ignore, getSensedOutlineLayer: () => ({ visible: false }),
  } as unknown as TokenRenderer);
  let time = 1000;
  const renderer = app.renderer as WebGLRenderer;
  const target = RenderTexture.create({ width: pane, height: pane, resolution });
  const place = (scale: number, x: number, y: number): void => {
    viewport.scale.set(scale);
    viewport.position.set(x, y);
  };
  return {
    app, viewport, store, controller,
    displayFrames: (count) => { for (let i = 0; i < count; i++) app.ticker.update(time += 16); },
    settle: async () => {
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (let frame = 0; frame < 2; frame++) app.ticker.update(time += 16);
      }
    },
    playerFrame: (scale, x, y) => {
      place(scale, x, y);
      controller.renderer.modeLayer.visible = true;
      try {
        controller.renderer.prepareBelow?.({ key: 'frame', width: pane, height: pane, resolution, mode: 'player' });
        renderer.render({ container: app.stage, target, clear: true, clearColor: [0, 0, 0, 1] });
        return renderer.extract.pixels({ target }).pixels;
      } finally {
        controller.renderer.modeLayer.visible = false;
      }
    },
    gmCanvas: (scale, x, y) => {
      place(scale, x, y);
      controller.renderer.prepareBelow?.();
      renderer.render({ container: app.stage, target, clear: true, clearColor: [0, 0, 0, 1] });
      return renderer.extract.pixels({ target }).pixels;
    },
    dispose: () => {
      target.destroy(true);
      controller.destroy();
      scheduler.destroy();
      app.destroy(true, { children: true });
    },
  };
}

/** World point of device pixel (`sx`, `sy`) through camera (`scale`, `x`, `y`). */
export function worldOf(sx: number, sy: number, resolution: number, scale: number, x: number, y: number): { x: number; y: number } {
  return new Matrix(scale, 0, 0, scale, x, y).applyInverse({ x: (sx + 0.5) / resolution, y: (sy + 0.5) / resolution });
}
