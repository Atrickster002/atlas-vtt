import { Ticker, type Application, type Container } from 'pixi.js';
import type { App } from 'obsidian';
import type { Viewport } from 'pixi-viewport';
import { mapImageSourceFor } from '../../MapLoader';
import { MapImage } from '../mapImage/MapImage';
import { MapImageService } from '../mapImage/MapImageService';
import type { MapImageViewport } from '../mapImage/mapImageTypes';
import type { PixelRect } from '../mapImage/pyramid';
import type { MapStretch } from '../../grid/mapStretch';
import { requestRender } from '../RenderScheduler';
import { TextureCache } from '../token-renderer/TextureCache';
import type { FogCover } from '../../vision/throughSight';
import type { BelowMapImage } from './levels/BelowLevel';
import type { BelowLevelsHost } from './levels/LevelsBelow';

export interface BelowLevelsHostDeps {
  obsApp: App;
  app: Application;
  viewport: Viewport;
  /** The committed fog of the level the view shows. */
  viewedFog: () => FogCover;
  /** Puts the openings' eraser into the view's stage, between its grid and its tokens. */
  placeEraser: (eraser: Container) => void;
}

/**
 * The view's camera for a map image of a level below: it reads where the view looks, so its tiles
 * follow the view's, and keeps the world size it sets to itself, which is the view's own image's.
 */
function viewCamera(viewport: Viewport): MapImageViewport {
  return {
    get left(): number { return viewport.left; },
    get top(): number { return viewport.top; },
    get worldScreenWidth(): number { return viewport.worldScreenWidth; },
    get worldScreenHeight(): number { return viewport.worldScreenHeight; },
    get scale(): { x: number } { return viewport.scale; },
    worldWidth: 0,
    worldHeight: 0,
  };
}

/** `image` as a level below reads it: backgrounds are loaded from the vault. A video map shows its poster, as a picture of the scene does. */
function belowMapImage(obsApp: App, image: MapImage): BelowMapImage {
  return {
    layer: image.layer,
    get worldRect(): PixelRect | null { return image.worldRect; },
    get mapStretch(): MapStretch { return image.mapStretch; },
    load: (background, gridSize, stretch) => image.load(mapImageSourceFor(obsApp, background, gridSize), stretch),
    setStretch: (stretch) => image.setStretch(stretch),
    drawFor: (view) => image.drawFor(view),
    addDemandRegion: (view) => image.addDemandRegion(view),
    destroy: () => image.destroy(),
  };
}

/** What a map view gives the levels below it: map images through its camera, token art, its fog and a place for the eraser. */
export function createBelowLevelsHost({ obsApp, app, viewport, viewedFog, placeEraser }: BelowLevelsHostDeps): BelowLevelsHost {
  return {
    createMapImage: () => belowMapImage(obsApp, new MapImage({
      service: MapImageService.forApp(obsApp),
      viewport: viewCamera(viewport),
      ticker: Ticker.shared,
      renderer: app.renderer,
      requestRender: () => requestRender(app),
    })),
    createArt: () => {
      const art = new TextureCache(obsApp);
      art.setPixiApp(app);
      return art;
    },
    viewedFog,
    placeEraser,
  };
}
