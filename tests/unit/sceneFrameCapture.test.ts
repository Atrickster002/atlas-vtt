import { describe, expect, it, vi } from 'vitest';
import type { GmOverlays } from '../../src/app/pixi/lighting/playerLightingLayers';
import type { SceneFrame } from '../../src/app/pixi/lighting/engine/types';
import { captureSceneFrame } from '../../src/app/pixi/sceneFrameCapture';

const FRAME: SceneFrame = { x: 300, y: 200, resolution: 0.5 };

function setup(wallEditorShown = true) {
  const pins = { visible: true };
  const hexLinks = { visible: true };
  const gmOverlays: GmOverlays = { wallEditor: { visible: wallEditorShown }, doorBadges: { visible: true }, lightMarkers: { visible: true } };
  const layers = [pins, hexLinks, gmOverlays.wallEditor, gmOverlays.doorBadges, gmOverlays.lightMarkers];
  const shown = (): boolean[] => layers.map((layer) => layer.visible);
  const markerLayers = [{ layer: pins, visible: false }, { layer: hexLinks, visible: false }];
  const renderForFrame = vi.fn(<T,>(_frame: SceneFrame, render: () => T): T => render());
  const lighting = { gmOverlays: () => gmOverlays, renderer: { renderForFrame } };
  return { markerLayers, lighting, renderForFrame, shown };
}

describe('captureSceneFrame', () => {
  it('renders without the GM markers and overlays, lit for the frame, and has them back afterwards', () => {
    const { markerLayers, lighting, renderForFrame, shown } = setup();
    const picture = captureSceneFrame({ markerLayers, lighting }, FRAME, () => shown());
    expect(picture).toEqual([false, false, false, false, false]);
    expect(renderForFrame).toHaveBeenCalledWith(FRAME, expect.any(Function));
    expect(shown()).toEqual([true, true, true, true, true]);
  });

  it('leaves a layer hidden that was hidden before, such as the wall editor without its tool', () => {
    const { markerLayers, lighting, shown } = setup(false);
    captureSceneFrame({ markerLayers, lighting }, FRAME, () => undefined);
    expect(shown()).toEqual([true, true, false, true, true]);
  });

  it('has the layers back when the render throws', () => {
    const { markerLayers, lighting, shown } = setup();
    expect(() => captureSceneFrame({ markerLayers, lighting }, FRAME, () => { throw new Error('Render failed'); })).toThrow('Render failed');
    expect(shown()).toEqual([true, true, true, true, true]);
  });

  it('renders a view without lighting as it is, without its markers', () => {
    const { markerLayers, shown } = setup();
    const picture = captureSceneFrame({ markerLayers, lighting: undefined }, FRAME, () => shown().slice(0, 2));
    expect(picture).toEqual([false, false]);
    expect(shown().slice(0, 2)).toEqual([true, true]);
  });

  it('returns the result of a render with nothing to hide', () => {
    expect(captureSceneFrame({ markerLayers: [], lighting: undefined }, FRAME, () => 'picture')).toBe('picture');
  });
});
