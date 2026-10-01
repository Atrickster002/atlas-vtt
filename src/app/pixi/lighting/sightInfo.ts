import type { TokenEntity } from '../../types';
import type { LightLevel } from '../../types/senseTypes';
import { lightLevelAt } from '../../vision/lightLevels';
import { perceive, perceivingRegion, targetOf, type PerceptionOptions } from '../../vision/perception';
import type { AmbientLight, LightReach, Sight } from '../../vision/sight';
import { tokenEffects } from '../../vision/sightRules';

const LIGHT_LEVEL_LABELS: Record<LightLevel, string> = {
  bright: 'Bright light',
  dim: 'Dim light',
  dark: 'Darkness',
  'magical-dark': 'Magical darkness',
};

/** What the GM calls a token: its name, its statblock's, or nothing. */
function nameOf(token: TokenEntity | undefined): string | null {
  if (!token || token.kind !== 'character') return null;
  return token.name?.trim() || token.statblockName?.trim() || null;
}

/**
 * One line for the GM about a token on a lit scene: the light it stands in, and whether the
 * players' tokens perceive it and through which sense, named as the collection writes it
 * ("Darkness · Seen by Mirabel: Darkvision").
 * A token with vision is one of theirs and always shown; a hidden token never is.
 */
export function tokenSightLine(
  token: TokenEntity,
  tokens: Record<string, TokenEntity>,
  sight: Sight,
  ambient: AmbientLight,
  lights: readonly LightReach[],
  { conditions = [] }: PerceptionOptions = {},
): string {
  const at = { x: token.x, y: token.y };
  const level = lightLevelAt(at, ambient, lights);
  const light = LIGHT_LEVEL_LABELS[level];
  if (token.isHidden) return `${light} · Hidden from the players`;
  if (token.vision?.enabled) return `${light} · Always shown to the players`;
  const target = targetOf(tokenEffects(token, conditions));
  const region = perceivingRegion(at, sight, level, target);
  if (!region) return `${light} · ${perceive(at, sight, level, target) === 'seen' ? 'Seen by the players' : 'Not seen by the players'}`;
  const viewer = nameOf(tokens[region.tokenId]) ?? 'a token';
  return `${light} · ${region.sense.precise ? 'Seen' : 'Sensed'} by ${viewer}: ${region.sense.name}`;
}
