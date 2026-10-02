import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { findAtlasLeafByViewId } from '../../utils/atlasLeafLookup';

export interface LightingSceneEvents {
  eventBus: EventEmitter;
  obsApp: App;
  viewId: string;
  /** The GM asked to forget the explored memory. */
  resetExplored: () => void;
  /** Ends whatever is being edited: a drag, a zone half drawn, an open popover. */
  stopEditing: () => void;
  /** The scene is about to go: what is pending of it is saved first. */
  beforeMapUnload: () => void;
}

/**
 * What the lighting hears from outside the store: the request to forget the explored memory,
 * the scene unloading, and another Obsidian tab coming to the front (by a key, without a press
 * that would close a popover). Returns what stops listening.
 */
export function listenToLightingSceneEvents({ eventBus, obsApp, viewId, resetExplored, stopEditing, beforeMapUnload }: LightingSceneEvents): Array<() => void> {
  const cleanups: Array<() => void> = [];
  const on = (event: string, handler: () => void): void => {
    eventBus.on(event, handler);
    cleanups.push(() => eventBus.off(event, handler));
  };
  on('lighting-reset-explored', resetExplored);
  on('map-unloading', () => {
    stopEditing();
    beforeMapUnload();
  });
  const leafChange = obsApp.workspace.on('active-leaf-change', (leaf) => {
    if (leaf !== findAtlasLeafByViewId(obsApp.workspace, viewId)) stopEditing();
  });
  cleanups.push(() => obsApp.workspace.offref(leafChange));
  return cleanups;
}
