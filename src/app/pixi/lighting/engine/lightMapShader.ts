import { GLSL_VERSION } from './glsl';

export const lightMapVertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec4 uRect;
uniform vec2 uMapWorld;
out vec2 vWorld;
void main() {
  vWorld = uRect.xy + aPosition * uRect.zw;
  gl_Position = vec4(vWorld / uMapWorld * 2.0 - 1.0, 0.0, 1.0);
}`;

// A light shows its two ranges: the bright level up to the bright radius, the dim level from
// there to the dim radius, a fade to exactly zero at the reach. The step between the levels is a
// soft knee, 1 / (1 + (d / bright)^4): half way down at the bright radius, without an edge a
// flicker could move. The fade starts at the dim radius and is a smootherstep, level in slope and
// curvature at both ends. A Gaussian halo around the flame adds to the levels before the fade
// and the tile, so it cannot pass a wall; a light without a bright radius sizes it by a quarter
// of its reach. Radii are floored at 1 px so an empty light stays finite in the float target.
// The tile is read with texelFetch: its rect sits on this map's texel grid, so a texel here is a
// texel there.
// Alpha holds the luminance the light would have here at its bright level (never less than it
// has): the composite tonemaps a light at that level and scales the result back, so a floor
// shows the dim range at the same share of the bright range whatever its colour.
// The colour is `uLightColor`: PIXI sets `uColor` itself, as a vec4, on every mesh shader that declares it.
export const lightMapFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec4 uRect;
uniform vec2 uLight;
uniform float uBright;
uniform float uDim;
uniform float uReach;
uniform float uIntensity;
uniform vec3 uLightColor;
uniform float uBrightLevel;
uniform float uDimLevel;
uniform float uHaloGain;
uniform float uHaloSize;
uniform float uTexel;
uniform sampler2D uTile;
out vec4 finalColor;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
void main() {
  ivec2 texel = ivec2(floor((vWorld - uRect.xy) / uTexel));
  ivec2 size = textureSize(uTile, 0);
  if (any(lessThan(texel, ivec2(0))) || any(greaterThanEqual(texel, size))) discard;
  float d = distance(vWorld, uLight);
  float reach = max(uReach, 1.0);
  float t = d / max(uBright, 1.0);
  float t2 = t * t;
  float e = mix(uDimLevel, uBrightLevel, 1.0 / (1.0 + t2 * t2));
  float s = max(max(uBright, reach * 0.25) * uHaloSize, 1.0);
  e += uHaloGain * exp(-(d * d) / (2.0 * s * s));
  float atBright = max(1.0, uBrightLevel / max(e, 1e-4));
  float u = clamp((reach - d) / max(reach - uDim, 1e-3), 0.0, 1.0);
  float fade = u * u * u * (u * (u * 6.0 - 15.0) + 10.0);
  vec3 light = uLightColor * (uIntensity * e * fade * texelFetch(uTile, texel, 0).r);
  finalColor = vec4(light, dot(light, LUMA) * atBright);
}`;
