import { BOUNCE_GATHER_GLSL } from './cascadeShaders';
import { GLSL_VERSION, SRGB_GLSL, TRACE_GLSL, fieldGlsl } from './glsl';
import { WALL_PUSH_GLSL } from './wallPushGlsl';

/**
 * The lighting layer's final pass. uTexture is the layer itself, what the vision tokens
 * perceive (`SightMeshes`, `sightChannels`):
 * - red: seen by light, as the light shows it;
 * - green: perceived without light, in the scene's look without colour (uGreyKeep, uGreyTint:
 *   the grey of darkvision, black and white, or heat tones);
 * - blue: perceived without light, in colour, at uColourLevel;
 * - alpha: dim light is perceived as bright (`litAsBright`).
 * Where two looks meet on a pixel, the brighter one shows (`brighter`).
 * uBackTexture is the scene beneath (map and tokens, sRGB). World textures are read
 * through uScreenToWorld, so every render (GM or player camera) lights its own view;
 * uPixelWorld is the size of a screen pixel in world pixels.
 * uAreaOrigin is where the filter's area starts on screen (PIXI's uOutputFrame holds it only
 * for the last filter of a chain; `AreaAwareFilter` computes it for any position in one).
 * In the player view, what no token sees now shows its memory (uMemory 1): the dim grey map
 * tinted by uExploredTint where explored, uUnexplored elsewhere; both colours are linear.
 * uDarkness (read only while uHasDarkness is set) is the darkness map: red is how much of the
 * light magical darkness swallows (the lights it swallows are gone from the light map already;
 * here the ambient light and the bounce go too, and what is perceived without light), green
 * what a sense that sees in magical darkness perceives of it (0.5 as dim light, 1 as bright).
 * In place of the map the players see a faint cool veil there (uVeil), so that magical darkness
 * tells apart from the unlit dark; the GM sees the dim map under a stronger one (uGmVeil).
 */
export const compositeFragment = `${GLSL_VERSION}
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform sampler2D uLightMap;
uniform sampler2D uExplored;
uniform vec2 uAreaOrigin;
uniform mat3 uScreenToWorld;
uniform float uPixelWorld;
uniform float uCore;
uniform float uBand;
uniform float uTexel;
uniform vec2 uLightWorld;
uniform vec2 uMapSize;
uniform vec3 uAmbient;
uniform float uExposure;
uniform float uBounceGain;
uniform float uPurkinje;
uniform float uMode;
uniform float uAllSeen;
uniform float uMemory;
uniform vec3 uExploredTint;
uniform vec3 uUnexplored;
uniform float uGreyKeep;
uniform vec3 uGreyTint;
uniform float uColourLevel;
uniform float uAmbientLift;
uniform sampler2D uDarkness;
uniform float uHasDarkness;
uniform vec3 uVeil;
uniform vec3 uGmVeil;
uniform float uGreyLevel;
uniform vec2 uDarkLevels;
${fieldGlsl('uField')}
float clearance(vec2 w) { return uFieldClearance(w); }
${TRACE_GLSL}
${WALL_PUSH_GLSL}
${BOUNCE_GATHER_GLSL}
${SRGB_GLSL}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
// Share of its colour an area no token sees loses in the GM view.
const float UNSEEN_FADE = 0.4;

// Khronos PBR Neutral: colours stay as painted up to ~0.8, highlights roll off to white.
vec3 neutral(vec3 color) {
  const float start = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  const float d = 1.0 - start;
  float newPeak = 1.0 - d * d / (peak + d - start);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

// Explored memory is stamped with hard-edged polygons: blur it over a disc of two memory texels,
// shrunk to the pixel's wall clearance so memory never smears across a wall. 12 Vogel taps,
// Gaussian in distance.
float exploredAt(vec2 w) {
  // The memory's scale is set by the map's longer side, whose texel count rounds least.
  vec2 size = vec2(textureSize(uExplored, 0));
  float texel = size.x >= size.y ? uMapSize.x / size.x : uMapSize.y / size.y;
  float r = min(2.0 * texel, clearance(w));
  float sum = textureLod(uExplored, clamp(w / uMapSize, 0.0, 1.0), 0.0).r;
  if (r < 0.25 * texel) return sum;
  float weights = 1.0;
  for (int i = 0; i < 12; i++) {
    float t = sqrt((float(i) + 0.5) / 12.0);
    float a = float(i) * 2.39996323;
    float k = exp(-2.0 * t * t);
    sum += k * textureLod(uExplored, clamp((w + vec2(cos(a), sin(a)) * t * r) / uMapSize, 0.0, 1.0), 0.0).r;
    weights += k;
  }
  return sum / weights;
}

// Whichever colour is brighter, blended near a tie (a per-channel max mixes them into pink).
vec3 brighter(vec3 a, vec3 b) {
  return mix(a, b, smoothstep(-0.02, 0.02, dot(b - a, LUMA)));
}

// Senses: the scene where dim light is perceived as bright. Every light is taken at its bright
// level (the light map's alpha is its luminance there), dim ambient light raised to bright
// (uAmbientLift); bounce stays as it is. No light, no change: darkness is not lit by this.
vec3 litAsBright(vec3 albedo, vec4 lamps, vec3 bounce, vec3 ambient) {
  vec3 direct = lamps.rgb * (lamps.a / max(dot(lamps.rgb, LUMA), 1e-4));
  vec3 light = ambient * uAmbientLift + (direct + bounce * uBounceGain) * uExposure;
  float level = dot(light, LUMA);
  vec3 lit = neutral(albedo * light);
  float fill = 1.0 - lamps.a * uExposure / max(level, 1e-4);
  float night = (1.0 - smoothstep(0.03, 0.35, level)) * uPurkinje * fill;
  return mix(lit, vec3(dot(lit, LUMA)) * vec3(0.86, 0.96, 1.18), night);
}

void main() {
  vec2 screen = vTextureCoord * uInputSize.xy + uAreaOrigin;
  vec2 world = (uScreenToWorld * vec3(screen, 1.0)).xy;
  vec3 albedo = toLinear(textureLod(uBackTexture, vTextureCoord, 0.0).rgb);
  // rgb: the lights' light; alpha: its luminance had every light its bright level here.
  vec4 lamps = textureLod(uLightMap, world / uLightWorld, 0.0);
  vec3 bounce = bounceAt(world);
  // Tiles end at the capsule: from its core to the band a wall's face takes the light (direct
  // and bounce alike) of the floor in front of it, on its own side, then blends back to its own
  // over a texel, where its own is fully lit (blending earlier left a dark line along walls).
  float d = wallDistance(world);
  float front = clamp((d - uCore) / uPixelWorld + 0.5, 0.0, 1.0) * (1.0 - smoothstep(uBand, uBand + uTexel, d));
  // r: the share of the light magical darkness swallows here; g: what sees in it, and how.
  vec2 dark = vec2(0.0);
  if (uHasDarkness > 0.5) dark = textureLod(uDarkness, world / uLightWorld, 0.0).rg;
  if (front > 0.0) {
    vec2 floorAt = climbFromWall(world, uBand);
    lamps = mix(lamps, textureLod(uLightMap, floorAt / uLightWorld, 0.0), front);
    bounce = mix(bounce, bounceAt(floorAt), front);
  }
  // Magical darkness swallows the ambient light and the bounce; the lights it swallows are not in the light map.
  float lightLeft = 1.0 - dark.r;
  vec3 ambient = uAmbient * lightLeft;
  bounce *= lightLeft;
  vec4 sight = textureLod(uTexture, vTextureCoord, 0.0);
  // Senses: what is perceived without light is seen too.
  float seen = max(uAllSeen, max(sight.r, max(sight.g, sight.b)));
  vec3 direct = lamps.rgb;
  vec3 light = ambient + (direct + bounce * uBounceGain) * uExposure;
  float level = dot(light, LUMA);
  // The tonemap's toe darkens low values more than in proportion, so on a dark floor a light's
  // dim range showed far below its share of the bright range. A light is tonemapped at its
  // bright level instead and the result scaled back to what it gives; without a light this is 1.
  float lift = 1.0 + max(lamps.a - dot(direct, LUMA), 0.0) * uExposure / max(level, 1e-4);
  vec3 lit = neutral(albedo * light * lift) / lift;
  // Cool grey where the light is low, by the share of it that is no light's own (ambient and
  // bounce): shifting a light's fade to black drew a pale ring around it.
  float fill = 1.0 - dot(direct, LUMA) * uExposure / max(level, 1e-4);
  float night = (1.0 - smoothstep(0.03, 0.35, level)) * uPurkinje * fill;
  lit = mix(lit, vec3(dot(lit, LUMA)) * vec3(0.86, 0.96, 1.18), night);

  // Senses: dim light as bright.
  if (sight.a > 0.0) lit = mix(lit, litAsBright(albedo, lamps, bounce, ambient), sight.a);

  // Senses in magical darkness: only one that sees there perceives it (green of the darkness
  // map), at the level it sees there instead of the level of its look in the dark.
  float sensed = 1.0;
  float greyGain = 1.0;
  float colourGain = 1.0;
  if (dark.r > 0.0) {
    float levelIn = mix(uDarkLevels.x, uDarkLevels.y, clamp(dark.g * 2.0 - 1.0, 0.0, 1.0));
    sensed = mix(1.0, clamp(dark.g * 2.0, 0.0, 1.0), dark.r);
    greyGain = mix(1.0, levelIn / uGreyLevel, dark.r);
    colourGain = mix(1.0, levelIn / max(uColourLevel, 1e-4), dark.r);
  }
  float grey = dot(albedo, LUMA);
  vec3 darkSight = mix(vec3(grey), albedo, uGreyKeep) * uGreyTint * greyGain;
  vec3 visible = mix(lit, brighter(lit, darkSight), sight.g * sensed);
  // Senses: perceived without light, in colour.
  visible = mix(visible, brighter(visible, albedo * uColourLevel * colourGain), sight.b * sensed);
  visible += uVeil * dark.r;
  float explored = uMode > 0.5 && uMemory > 0.5 && seen < 1.0 ? exploredAt(world) : 0.0;
  vec3 memory = mix(uUnexplored, vec3(grey) * 0.07 * uExploredTint, explored);
  vec3 player = mix(memory, visible, seen);

  // The GM always sees the map and every light at full strength: a dim floor screen-blended under
  // the light. What no token sees keeps its brightness and loses part of its colour.
  vec3 floorColor = albedo * 0.05;
  vec3 gmLit = 1.0 - (1.0 - lit) * (1.0 - floorColor);
  vec3 unseen = mix(gmLit, vec3(dot(gmLit, LUMA)), UNSEEN_FADE);
  vec3 gm = mix(unseen, 1.0 - (1.0 - visible) * (1.0 - floorColor), seen) + uGmVeil * dark.r;

  vec3 color = uMode > 0.5 ? player : gm;
  float dither = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  finalColor = vec4(toSrgb(max(color, 0.0)) + dither, 1.0);
}`;
