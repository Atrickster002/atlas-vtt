import type { TokenEntity } from '../types';
import type { InitiativeEntry } from '../types/initiativeTypes';

/** An entry before the store gives it an id and a place in the order. */
export type NewInitiativeEntry = Omit<InitiativeEntry, 'id' | 'order' | 'isActive'>;

export interface Vitals {
  current: number;
  max: number;
}

/** A token's hit points as the tracker shows them; a token without any (no statblock) has none. */
export function initiativeHp(token: TokenEntity): Vitals | undefined {
  if (token.kind !== 'character' || token.hp == null) return undefined;
  return typeof token.hp === 'object'
    ? { current: token.hp.current, max: token.hp.max }
    : { current: token.hp, max: token.hp };
}

export function initiativeStress(token: TokenEntity): Vitals | undefined {
  if (token.kind !== 'character' || token.stress == null) return undefined;
  return typeof token.stress === 'object'
    ? { current: token.stress.current, max: token.stress.max }
    : { current: token.stress, max: token.maxStress ?? 10 };
}

export function sameVitals(a: Vitals | undefined, b: Vitals | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a.current === b.current && a.max === b.max);
}

/** Whether hit points count as defeated; a token without hit points never is. */
export function isDefeatedAt(hp: Vitals | undefined): boolean {
  return hp !== undefined && hp.current <= 0;
}

export function initiativeEntryForToken(token: TokenEntity): NewInitiativeEntry {
  const character = token.kind === 'character' ? token : null;
  const hp = initiativeHp(token);
  const stress = initiativeStress(token);
  return {
    tokenId: token.id,
    name: character ? character.name : 'Token',
    initiative: 0,
    initiativeModifier: 0,
    imagePath: token.imagePath,
    isDefeated: isDefeatedAt(hp),
    isNPC: !character?.playerLinked,
    ...(hp ? { hp } : {}),
    ...(stress ? { stress } : {}),
    ...(character?.statblockPath ? { statblockPath: character.statblockPath } : {}),
  };
}
