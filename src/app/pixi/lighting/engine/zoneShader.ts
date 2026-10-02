import { MAX_ZONE_CORNERS } from '../../../lighting/lightZones';
import { GLSL_VERSION, TRACE_GLSL, fieldGlsl } from './glsl';

/**
 * One ambient zone over the rectangle around it (`lightMapVertex`), written premultiplied, so
 * zones drawn in their order lie over each other as the rule has them: `uZoneLight` (the zone's
 * ambient light in linear light) times its share, and the share in alpha. Inside the polygon
 * (`uPoints`, `uCount` corners) the share is 1: there the rule counts the zone. Past the outline
 * it falls to 0 over `uSoft` world pixels, where the nearest point of the outline is in plain
 * view: the trace stops at walls, so the soft edge never lies behind one, and passes a doorway.
 */
export const zoneFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec2 uPoints[${MAX_ZONE_CORNERS}];
uniform int uCount;
uniform float uSoft;
uniform vec3 uZoneLight;
out vec4 finalColor;
${fieldGlsl('uField')}
float clearance(vec2 w) { return uFieldClearance(w); }
${TRACE_GLSL}
void main() {
  bool inside = false;
  float best = 1e20;
  vec2 nearest = vWorld;
  for (int i = 0; i < ${MAX_ZONE_CORNERS}; i++) {
    if (i >= uCount) break;
    vec2 a = uPoints[i];
    vec2 b = uPoints[i + 1 == uCount ? 0 : i + 1];
    if ((a.y > vWorld.y) != (b.y > vWorld.y) && vWorld.x < (b.x - a.x) * (vWorld.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    vec2 ab = b - a;
    vec2 q = a + ab * clamp(dot(vWorld - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = distance(vWorld, q);
    if (d < best) {
      best = d;
      nearest = q;
    }
  }
  float share = 1.0;
  if (!inside) {
    if (best >= uSoft || !reaches(vWorld, nearest)) discard;
    float u = 1.0 - best / uSoft;
    share = u * u * (3.0 - 2.0 * u);
  }
  finalColor = vec4(uZoneLight * share, share);
}`;
