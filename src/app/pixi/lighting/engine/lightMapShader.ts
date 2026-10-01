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

// Height falloff E ∝ (d² + h²)^(−3/2): a lamp above the floor, round and hot under it, then
// inverse-square; normalised to ½ at the bright radius and windowed to exactly zero at the
// reach (Karis). A light without a bright radius uses a quarter of its reach as one; radii are
// floored at 1 px so an empty light stays finite in the float target. A Gaussian halo around the
// flame adds to the falloff before the window and the tile, so it cannot pass a wall. The tile
// is read with texelFetch: its rect sits on this map's texel grid, so a texel here is a texel there.
// The colour is `uLightColor`: PIXI sets `uColor` itself, as a vec4, on every mesh shader that declares it.
export const lightMapFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec4 uRect;
uniform vec2 uLight;
uniform float uBright;
uniform float uReach;
uniform float uIntensity;
uniform vec3 uLightColor;
uniform float uHeight;
uniform float uHaloGain;
uniform float uHaloSize;
uniform float uTexel;
uniform sampler2D uTile;
out vec4 finalColor;
void main() {
  ivec2 texel = ivec2(floor((vWorld - uRect.xy) / uTexel));
  ivec2 size = textureSize(uTile, 0);
  if (any(lessThan(texel, ivec2(0))) || any(greaterThanEqual(texel, size))) discard;
  float d = distance(vWorld, uLight);
  float reach = max(uReach, 1.0);
  float b = max(max(uBright, reach * 0.25), 1.0);
  float h = b * uHeight;
  float e = 0.5 * pow((1.0 + d * d / (h * h)) / (1.0 + b * b / (h * h)), -1.5);
  float s = max(b * uHaloSize, 1.0);
  e += uHaloGain * exp(-(d * d) / (2.0 * s * s));
  float q = d / reach;
  float window = clamp(1.0 - q * q * q * q, 0.0, 1.0);
  finalColor = vec4(uLightColor * uIntensity * e * window * window * texelFetch(uTile, texel, 0).r, 1.0);
}`;
