import { GLSL_VERSION } from './glsl';

// How much of the light a darkness source swallows at each texel of its tile: all of it inside,
// fading to none over the last `uSoft` px before its radius (never beyond it: outside the radius
// the rules count nothing as darkened), and only where its tile shows a clear path from the
// source, so walls end darkness as they end light. `uOut` picks what the coverage is written as:
// alpha, to erase the light map beneath it (`LightMap`), or red, the darkness map's own channel.
export const darknessFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec4 uRect;
uniform vec2 uLight;
uniform float uDim;
uniform float uSoft;
uniform float uTexel;
uniform vec4 uOut;
uniform sampler2D uTile;
out vec4 finalColor;
void main() {
  ivec2 texel = ivec2(floor((vWorld - uRect.xy) / uTexel));
  ivec2 size = textureSize(uTile, 0);
  if (any(lessThan(texel, ivec2(0))) || any(greaterThanEqual(texel, size))) discard;
  float d = distance(vWorld, uLight);
  float u = clamp((uDim - d) / max(uSoft, 1e-3), 0.0, 1.0);
  float inside = u * u * (3.0 - 2.0 * u);
  finalColor = uOut * (inside * texelFetch(uTile, texel, 0).r);
}`;

/** A polygon in world pixels, drawn over the whole map target. */
export const pierceVertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec2 uMapWorld;
void main() {
  gl_Position = vec4(aPosition / uMapWorld * 2.0 - 1.0, 0.0, 1.0);
}`;

// What a sense that sees in magical darkness perceives: its area, at the level it sees there,
// in the darkness map's green channel.
export const pierceFragment = `${GLSL_VERSION}
uniform float uLevel;
out vec4 finalColor;
void main() {
  finalColor = vec4(0.0, uLevel, 0.0, 0.0);
}`;
