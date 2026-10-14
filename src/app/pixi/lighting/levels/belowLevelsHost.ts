import { Ticker, type Application, type Container } from 'pixi.js';
import type { App } from 'obsidian';
import type { Viewport } from 'pixi-viewport';
import { mapImageSourceFor } from '../../../MapLoader';
import { MapImage } from '../../mapImage/MapImage';
import { MapImageService } from '../../mapImage/MapImageService';
import type { MapImageViewport } from '../../mapImage/mapImageTypes';
import { requestRender } from '../../RenderScheduler';
import { TextureCache } from '../../token-renderer/TextureCache';
import type { FogCover } from '../../../vision/throughSight';
import type { BelowLevelsHost } from './LevelsBelow';

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

/** What a map view gives the levels below it: map images through its camera, token art, its fog and a place for the eraser. */
export function createBelowLevelsHost({ obsApp, app, viewport, viewedFog, placeEraser }: BelowLevelsHostDeps): BelowLevelsHost {
  return {
    // A level below shows a video map's poster, as a picture of the scene does.
    createMapImage: () => new MapImage({
      service: MapImageService.forApp(obsApp),
      viewport: viewCamera(viewport),
      ticker: Ticker.shared,
      renderer: app.renderer,
      requestRender: () => requestRender(app),
    }),
    mapSource: (background, gridSize) => mapImageSourceFor(obsApp, background, gridSize),
    createArt: () => {
      const art = new TextureCache(obsApp);
      art.setPixiApp(app);
      return art;
    },
    viewedFog,
    placeEraser,
  };
}
