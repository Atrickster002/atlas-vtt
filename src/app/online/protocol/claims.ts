import { MAX_SCENE_ID } from './moves.ts';
import { TOKEN_ID_PATTERN } from './tokens.ts';

interface ClaimFields {
  readonly scene: string;
  /** The token, by the id players know it by. */
  readonly id: string;
}

/** A player claims a player token of the shared scene for themselves, or gives one of theirs back. */
export type PlayerClaim = ({ readonly t: 'claim' } | { readonly t: 'release' }) & ClaimFields;

/** A claim or release as the GM reads it, or null for anything malformed. */
export function parsePlayerClaim(value: Record<string, unknown>): PlayerClaim | null {
  const { t, scene, id } = value;
  if (t !== 'claim' && t !== 'release') return null;
  const valid = typeof scene === 'string' && scene.length > 0 && scene.length <= MAX_SCENE_ID && typeof id === 'string' && TOKEN_ID_PATTERN.test(id);
  return valid ? { t, scene, id } : null;
}
