/** The app's one grid detection client: every map and panel asks it, and it is gone with the plugin. */

import { detectionStopped, GridDetectionClient } from './GridDetectionClient';
import type { DetectOptions, MapPixels } from './GridDetectionClient';
import { pictureOf } from './detectGrid';
import type { DetectableMap } from './detectGrid';
import { NO_GRID } from './detectionJob';
import type { DetectionOutcome } from './detectionJob';
import DetectionWorker from './detectionWorker?worker&inline';

let client: GridDetectionClient | null = null;
/** Set on unload, so work finishing afterwards cannot start a worker for a plugin that is gone. */
let disposed = false;

/**
 * Detects the grid in a map's pixels, or fits `options.candidates` to its lines, off the main thread.
 * Ask with the same `pixels` for the same map: the worker keeps what it read of them.
 */
export function detectGridInGray(pixels: MapPixels, options?: DetectOptions): Promise<DetectionOutcome> {
  if (disposed) return Promise.reject(detectionStopped());
  client ??= new GridDetectionClient(() => new DetectionWorker({ name: 'Atlas grid detection' }));
  return client.detect(pixels, options);
}

/** Detects the grid of a map image; no grid for a map whose pixels cannot be read. */
export function detectGridOfMap(map: DetectableMap, options?: DetectOptions): Promise<DetectionOutcome> {
  const picture = pictureOf(map);
  return picture ? detectGridInGray(picture, options) : Promise.resolve(NO_GRID);
}

/** Stops the worker; called when the plugin unloads. */
export function disposeGridDetection(): void {
  disposed = true;
  client?.dispose();
  client = null;
}
