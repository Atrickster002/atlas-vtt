import { defaultFilterVert } from 'pixi.js';
import { capsuleFieldFragment, capsuleFieldVertex } from './capsuleFieldShader';
import { cascadeFragment, cascadeVertex, emissionFragment, resolveFragment } from './cascadeShaders';
import { compositeFragment } from './compositeShader';
import { lightMapFragment, lightMapVertex } from './lightMapShader';
import { sightFragment, sightVertex } from './sightShader';
import { tileFragment, tileVertex } from './tileShader';
import { tileSmoothFragment } from './tileSmoothShader';

export interface EngineShaderSource {
  readonly name: string;
  readonly vertex: string;
  readonly fragment: string;
}

/**
 * Every program the lighting engine draws with. Passes create their shaders from these entries
 * (`createShader`), so the rules the unit tests hold the sources to, and the check that they
 * compile on the device (`verifyEngineShaders`), cover all of them.
 */
export const ENGINE_SHADERS = {
  capsuleField: { name: 'atlas-capsule-field', vertex: capsuleFieldVertex, fragment: capsuleFieldFragment },
  tile: { name: 'atlas-visibility-tile', vertex: tileVertex, fragment: tileFragment },
  tileSmooth: { name: 'atlas-visibility-tile-smooth', vertex: tileVertex, fragment: tileSmoothFragment },
  lightMap: { name: 'atlas-light-map', vertex: lightMapVertex, fragment: lightMapFragment },
  bounceEmission: { name: 'atlas-bounce-emission', vertex: cascadeVertex, fragment: emissionFragment },
  bounceCascade: { name: 'atlas-bounce-cascade', vertex: cascadeVertex, fragment: cascadeFragment },
  bounceResolve: { name: 'atlas-bounce-resolve', vertex: cascadeVertex, fragment: resolveFragment },
  sight: { name: 'atlas-sight', vertex: sightVertex, fragment: sightFragment },
  composite: { name: 'atlas-lighting-composite', vertex: defaultFilterVert, fragment: compositeFragment },
} as const satisfies Record<string, EngineShaderSource>;
