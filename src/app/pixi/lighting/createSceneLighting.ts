import type { App } from 'obsidian';
import type { Application, Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { ViewAtlasStore } from '../../storeFactory';
import type { MapBounds } from '../../vision/visibility';
import { usesCanvasRenderer } from '../utils/rendererType';
import { CanvasLightingFallback } from './CanvasLightingFallback';
import { StoredLightingAttempt } from './lightingAttempts';
import { LightingRenderer } from './LightingRenderer';
import { showLightingUnavailableNotice } from './lightingUnavailableNotice';
import { LightingViewHost } from './LightingViewHost';

export interface SceneLightingDeps {
  viewport: Viewport;
  app: Application;
  store: ViewAtlasStore;
  obsApp: App;
  measurement: () => MeasurementSettings;
  bounds: () => MapBounds | null;
  /** The map image, for the colours light bounces off. */
  albedo: () => Texture | null;
}

/**
 * The scene lighting of a map view: the GPU engine where the graphics device runs it, the
 * line-of-sight fallback where it does not (`LightingViewHost` swaps them).
 */
export function createSceneLighting({ viewport, app, store, obsApp, measurement, bounds, albedo }: SceneLightingDeps): LightingViewHost {
  const attempt = new StoredLightingAttempt(obsApp, () => store.getState().mapPath);
  return new LightingViewHost({
    store,
    canvasRenderer: usesCanvasRenderer(app.renderer),
    createEngineView: (onUnavailable) => new LightingRenderer({ viewport, app, store, measurement, bounds, albedo, attempt, onUnavailable }),
    createFallback: () => new CanvasLightingFallback({ viewport, store, measurement, bounds }),
    forgetAttempt: () => attempt.forget(),
    notify: showLightingUnavailableNotice,
  });
}
