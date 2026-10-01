/**
 * The seam between linked statblocks and sight: one object a lighting view asks for each
 * token's senses, and that tells it when a statblock it asked about changed.
 *
 *     const senses = tokenSensesResolver(CreatureIndex.forApp(app), () => mapSenseRules(app, assetService, store.getState()));
 *     const stop = senses.subscribe(() => rebuildSight());   // on destroy: stop()
 *     // while building sight sources, for every vision token:
 *     const { senses: list, blindBeyond, blindBeyondRange } = senses.visionOf(token);
 *
 * `CreatureIndex` is the store React reads through `useCreatureIndex`; `subscribe` here is the
 * same subscription for a consumer outside React, narrowed to the statblocks it asked about.
 * A change of the collection's senses or unit is not announced: the rules are read on every
 * call, so it shows at the consumer's next rebuild.
 */

import type { GameUnit } from '../grid/statedDistance';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';
import type { CreatureIndex, IndexedCreature } from './CreatureIndex';
import { effectiveVision, ownSenses, type EffectiveVision, type SensedToken } from './creatureSenses';

/** What a senses line is read with: the collection's senses and what it measures in. */
export interface SenseRules {
  definitions: readonly SenseDefinition[];
  unit: GameUnit;
}

/** The part of `CreatureIndex` the resolver uses. */
export type CreatureSource = Pick<CreatureIndex, 'get' | 'request' | 'subscribe'>;

export interface TokenSensesResolver {
  /** The token's senses: its own, else its statblock's (`effectiveSenses`). Shared and frozen where they come from a statblock. */
  sensesOf(token: SensedToken): TokenSense[];
  /** The same with where they come from, and whether the statblock says the creature is blind beyond them. */
  visionOf(token: SensedToken): EffectiveVision;
  /** Calls `listener` whenever a statblock asked about since was read or changed; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/**
 * Resolves tokens' senses through `creatures`, reading `rules` (called for every token asked
 * about, so keep it cheap) for the collection the tokens are in. A statblock not read yet
 * is requested and gives no senses until it arrives, which `subscribe` announces.
 */
export function tokenSensesResolver(creatures: CreatureSource, rules: () => SenseRules): TokenSensesResolver {
  /** The record last handed out for each statblock asked about. */
  const seen = new Map<string, IndexedCreature | null | undefined>();
  const listeners = new Set<() => void>();
  let detach: (() => void) | null = null;

  const indexChanged = (): void => {
    let changed = false;
    for (const [path, record] of seen) {
      const current = creatures.get(path);
      if (current === record) continue;
      seen.set(path, current);
      changed = true;
    }
    if (changed) for (const listener of [...listeners]) listener();
  };

  /** The statblock's record, asked for once; undefined until the index has read it. */
  const creatureOf = (path: string): IndexedCreature | null | undefined => {
    const record = creatures.get(path);
    const asked = seen.has(path);
    seen.set(path, record);
    // The index tells its listeners that it started reading; the record itself is unchanged then.
    if (record === undefined && !asked) creatures.request([path]);
    return record;
  };

  const visionOf = (token: SensedToken): EffectiveVision => {
    const { definitions, unit } = rules();
    // A token with senses of its own never touches the index.
    const follows = token.statblockPath && !ownSenses(token, definitions) ? token.statblockPath : null;
    return effectiveVision(token, follows ? creatureOf(follows) : null, definitions, unit);
  };

  return {
    visionOf,
    sensesOf: (token) => visionOf(token).senses,
    subscribe: (listener) => {
      listeners.add(listener);
      detach ??= creatures.subscribe(indexChanged);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        detach?.();
        detach = null;
      };
    },
  };
}
