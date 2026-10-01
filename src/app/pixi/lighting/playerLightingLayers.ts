import type { TokenEntity } from '../../types';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { lightLevelAt } from '../../vision/lightLevels';
import { perceive, targetOf, type Perception } from '../../vision/perception';
import type { AmbientLight, LightReach, Sight } from '../../vision/sight';
import { tokenEffects } from '../../vision/sightRules';
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
  /** The outlines of tokens the players sense without seeing them; only the players' view shows them. */
  sensedOutlines?: HideableLayer | undefined;
}

/**
 * Layer changes for the players' view: the GM's overlays never show; with lighting on, the
 * player's view and the outlines of the tokens they only sense. The one list of them: a player
 * frame applies it for one capture, the GM's own canvas holds it in session view (`SessionLighting`).
 */
export function playerLightingLayers({ enabled, modeLayer, gmOverlays, sensedOutlines }: PlayerLightingInput): LayerVisibility[] {
  const hidden = Object.values<HideableLayer>(gmOverlays).map((layer) => ({ layer, visible: false }));
  const outlines = sensedOutlines ? [{ layer: sensedOutlines, visible: enabled }] : [];
  return enabled ? [{ layer: modeLayer, visible: true }, ...outlines, ...hidden] : [...outlines, ...hidden];
}

/** How the players perceive each token. */
export type TokenPerception = (tokenId: string) => Perception;

/**
 * How the vision tokens perceive each token, by its centre, the light there and its conditions.
 * A token with vision is always shown, whatever its conditions and the light: the players'
 * window is one shared screen, and they are the party. `tokens` is the record the positions are
 * read from, so a caller may pass tokens at other places than the store's.
 */
export function tokenPerception(
  sight: Sight,
  ambient: AmbientLight,
  lights: readonly LightReach[],
  tokens: Record<string, TokenEntity>,
  conditions: readonly ConditionDefinition[] = [],
): TokenPerception {
  return (tokenId) => {
    const token = tokens[tokenId];
    if (!token) return 'unseen';
    if (token.vision?.enabled) return 'seen';
    const at = { x: token.x, y: token.y };
    return perceive(at, sight, lightLevelAt(at, ambient, lights), targetOf(tokenEffects(token, conditions)));
  };
}

/**
 * How the players perceive the tokens by a scene's lighting, for their frame and for the GM's
 * canvas in session view alike. Undefined while the scene is unlit: sight hides nothing then.
 */
export function playerTokenSight(
  lighting: Pick<SceneLightingView, 'isEnabled' | 'currentSight' | 'ambientLight' | 'lightReaches'>,
  tokens: Record<string, TokenEntity>,
  conditions: readonly ConditionDefinition[] = [],
): TokenPerception | undefined {
  if (!lighting.isEnabled()) return undefined;
  return tokenPerception(lighting.currentSight(), lighting.ambientLight(), lighting.lightReaches(), tokens, conditions);
}
