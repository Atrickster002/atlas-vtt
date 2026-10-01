import { describe, expect, it } from 'vitest';
import { clampLitThreshold, dimThresholdOf, exploredMemoryOn, litThresholdOf, readSceneLighting, sceneLook, tokenVisionOn } from '../../src/app/lighting/sceneLightingOptions';
import { DEFAULT_SCENE_LIGHTING } from '../../src/app/types/lightingTypes';

describe('scene lighting options', () => {
  it('uses token vision and explored memory unless the scene switches them off', () => {
    expect(tokenVisionOn(DEFAULT_SCENE_LIGHTING)).toBe(true);
    expect(tokenVisionOn({ tokenVision: false })).toBe(false);
    expect(exploredMemoryOn(DEFAULT_SCENE_LIGHTING)).toBe(true);
    expect(exploredMemoryOn({ exploredMemory: false })).toBe(false);
  });

  it('counts a scene as lit from 25 % ambient light unless it sets its own threshold', () => {
    expect(litThresholdOf(DEFAULT_SCENE_LIGHTING)).toBe(0.25);
    expect(litThresholdOf({ litThreshold: 0.6 })).toBe(0.6);
    expect(litThresholdOf({ litThreshold: 7 })).toBe(1);
  });

  it('clamps thresholds to 0..1 and replaces non-numbers with the default', () => {
    expect(clampLitThreshold(-1)).toBe(0);
    expect(clampLitThreshold(0.4)).toBe(0.4);
    expect(clampLitThreshold(2)).toBe(1);
    expect(clampLitThreshold(Number.NaN)).toBe(0.25);
  });

  it('counts ambient light as dim from half the lit threshold unless the scene sets its own dim threshold', () => {
    expect(dimThresholdOf(DEFAULT_SCENE_LIGHTING)).toBe(0.125);
    expect(dimThresholdOf({ litThreshold: 0.6 })).toBe(0.3);
    expect(dimThresholdOf({ litThreshold: 7 })).toBe(0.5);
    expect(dimThresholdOf({ dimThreshold: 0.05 })).toBe(0.05);
    expect(dimThresholdOf({ litThreshold: 0.6, dimThreshold: 0.4 })).toBe(0.4);
  });

  it('keeps the dim threshold between 0 and the lit threshold, and replaces non-numbers with the default', () => {
    expect(dimThresholdOf({ dimThreshold: -1 })).toBe(0);
    expect(dimThresholdOf({ dimThreshold: 0.9 })).toBe(0.25);
    expect(dimThresholdOf({ litThreshold: 0.6, dimThreshold: 0.9 })).toBe(0.6);
    expect(dimThresholdOf({ litThreshold: 0.6, dimThreshold: Number.NaN })).toBe(0.3);
    expect(dimThresholdOf({ litThreshold: 0, dimThreshold: 0.2 })).toBe(0);
  });

  it('reads saved lighting with defaults for missing fields and without unreadable colours', () => {
    expect(readSceneLighting(undefined)).toEqual(DEFAULT_SCENE_LIGHTING);
    expect(readSceneLighting({ enabled: true, ambientColor: '#AABBCC', exploredColor: 'red', unexploredColor: '#12345' }))
      .toEqual({ ...DEFAULT_SCENE_LIGHTING, enabled: true, ambientColor: '#AABBCC' });
  });

  it('passes the composite only the options it draws, and only those that are set', () => {
    expect(sceneLook({ ...DEFAULT_SCENE_LIGHTING, tokenVision: false, litThreshold: 0.5 })).toEqual({ ambient: DEFAULT_SCENE_LIGHTING.ambient });
    expect(sceneLook({ enabled: true, ambient: 0.3, ambientColor: '#ffeedd', exploredMemory: false, exploredColor: '#ff0000', unexploredColor: '#0000ff' }))
      .toEqual({ ambient: 0.3, ambientColor: '#ffeedd', exploredMemory: false, exploredColor: '#ff0000', unexploredColor: '#0000ff' });
  });
});
