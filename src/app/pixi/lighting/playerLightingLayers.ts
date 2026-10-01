import type { TokenEntity } from '../../types';
import { movedWhileHeld, type HeldTokens } from '../../lighting/sightOnDrop';
import { inSight, isFelt, isSeen, type AmbientLight, type LightReach, type Sight } from '../../vision/sight';
import type { HideableLayer, LayerVisibility } from '../playerSafeFrame';
import type { SceneLightingView } from './sceneLightingView';

/** Things only the GM may see. A type, not an interface, so `Object.values` knows its layers. */
export type GmOverlays = {
  /** Wall lines and their handles, shown with the lighting tool. */
  wallEditor: HideableLayer;
  doorBadges: HideableLayer;
  /** The badges on placed lights. */
  lightMarkers: HideableLayer;
  /** The range rings of the light whose popover is open. */
  rangeRings: HideableLayer;
};

export interface PlayerLightingInput {
  enabled: boolean;
  /** `LightingRenderer.modeLayer`: visible renders the player's view. */
  modeLayer: HideableLayer;
  gmOverlays: GmOverlays;
}

/**
 * Layer changes for the players' view: the GM's overlays never show; with lighting on, the
 * player's view. The one list of them: a player frame applies it for one capture, the GM's own
 * canvas holds it in session view (`SessionLighting`).
 */
export function playerLightingLayers({ enabled, modeLayer, gmOverlays }: PlayerLightingInput): LayerVisibility[] {
  const hidden = Object.values<HideableLayer>(gmOverlays).map((layer) => ({ layer, visible: false }));
  return enabled ? [{ layer: modeLayer, visible: true }, ...hidden] : hidden;
}

/**
 * Whether the viewer sees each token, by its centre. The viewer's own tokens always show, lit or
 * not, and so do tokens within a vision token's tremorsense, whatever walls or darkness lie between.
 *
 * One of the viewer's own tokens that is dragged while sight waits for the drop (`held`:
 * `heldForSight`) shows only in the line of sight that stayed behind. Beyond it the players'
 * picture is dark or remembered, and the token goes with its nameplate, bars and conditions
 * rather than leaving them over the darkness.
 */
// The `held` rule is sight on drop's and must survive a rework of this function: without it a
// dragged vision token's nameplate and bars stand over the darkness that covers its sprite.
export function tokenSeenPredicate(
  sight: Sight,
  ambient: AmbientLight,
  lights: readonly LightReach[],
  tokens: Record<string, TokenEntity>,
  held: HeldTokens = {},
): (tokenId: string) => boolean {
  return (tokenId) => {
    const token = tokens[tokenId];
    if (!token) return false;
    const at = { x: token.x, y: token.y };
    if (token.vision?.enabled) return !movedWhileHeld(token, held) || inSight(at, sight) || isFelt(at, sight);
    return isFelt(at, sight) || isSeen(at, sight, ambient, lights);
  };
}

/**
 * Which tokens the players see by a scene's lighting, for their frame and for the GM's canvas
 * in session view alike. Undefined while the scene is unlit: sight hides nothing then.
 */
export function playerTokenSight(
  lighting: Pick<SceneLightingView, 'isEnabled' | 'currentSight' | 'ambientLight' | 'lightReaches'>,
  tokens: Record<string, TokenEntity>,
  held?: HeldTokens,
): ((tokenId: string) => boolean) | undefined {
  if (!lighting.isEnabled()) return undefined;
  return tokenSeenPredicate(lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches(), tokens, held);
}
