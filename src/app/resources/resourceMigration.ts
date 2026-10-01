import { resourceKey } from './resourceDefinitions';
import { withHiddenResources } from './sceneVisibility';
import type { ResourceHolder, ResourceValue } from './resourceTypes';

/** Maxima the old bars showed for values stored as bare numbers; a larger number is its own maximum. */
export const LEGACY_MAX_HP = 100;
export const LEGACY_MAX_STRESS = 10;

const LEGACY_KEYS = ['hp', 'stress', 'maxStress', 'hope', 'statblockResources', 'maxHpOverridden', 'maxStressOverridden'] as const;

function valueOf(raw: unknown, fallbackMax: number): ResourceValue | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return { current: raw, max: Math.max(raw, fallbackMax) };
  if (raw && typeof raw === 'object') {
    const { current, max } = raw as Record<string, unknown>;
    if (typeof current === 'number' && typeof max === 'number') return { current, max };
  }
  return null;
}

/**
 * A token (or saved token state) written before resources existed, converted
 * to `resources` / `overriddenMax`. Values keep their numbers; tokens without
 * old fields are returned unchanged, so it is safe to run on every load.
 */
export function migrateTokenState<T extends object>(token: T): T & ResourceHolder {
  const old = token as Record<string, unknown>;
  if (!LEGACY_KEYS.some((key) => key in old)) return token;

  const resources: Record<string, ResourceValue> = {};
  const put = (key: string, value: ResourceValue | null): void => { if (value) resources[key] = value; };

  put('hp', valueOf(old.hp, LEGACY_MAX_HP));
  const maxStress = typeof old.maxStress === 'number' && old.maxStress > 0 ? old.maxStress : LEGACY_MAX_STRESS;
  put('stress', valueOf(old.stress, maxStress));
  put('hope', valueOf(old.hope, LEGACY_MAX_STRESS));
  if (old.statblockResources && typeof old.statblockResources === 'object') {
    for (const [name, value] of Object.entries(old.statblockResources as Record<string, unknown>)) {
      // The key a resource of that name gets, so defining it finds the value; never over HP, Stress or Hope.
      const key = resourceKey(name.replace(/^resources\./, ''), []);
      if (!(key in resources)) put(key, valueOf(value, 0));
    }
  }

  const overridden = new Set(Array.isArray(old.overriddenMax) ? (old.overriddenMax as string[]) : []);
  if (old.maxHpOverridden === true) overridden.add('hp');
  if (old.maxStressOverridden === true) overridden.add('stress');

  const next: Record<string, unknown> = { ...old };
  for (const key of LEGACY_KEYS) delete next[key];
  const existing = (old.resources && typeof old.resources === 'object') ? old.resources as Record<string, ResourceValue> : {};
  const merged = { ...resources, ...existing };
  if (Object.keys(merged).length > 0) next.resources = merged;
  if (overridden.size > 0) next.overriddenMax = [...overridden];
  return next as T & ResourceHolder;
}

/** Map token settings: the two bar switches become the list of resources the map hides. */
export function migrateTokenSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return withHiddenResources(settings);
}

/** Initiative entries used to copy HP, Stress and "defeated" from their tokens; they read the token now. */
export function migrateInitiative<T>(initiative: T): T {
  const entries = (initiative as { entries?: unknown } | undefined)?.entries;
  if (!Array.isArray(entries)) return initiative;
  const copied = (entry: unknown): boolean => entry !== null && typeof entry === 'object'
    && ('hp' in entry || 'stress' in entry || 'isDefeated' in entry);
  if (!entries.some(copied)) return initiative;
  return {
    ...initiative,
    entries: entries.map((entry: unknown) => {
      if (!copied(entry)) return entry;
      const { hp: _hp, stress: _stress, isDefeated: _isDefeated, ...rest } = entry as Record<string, unknown>;
      return rest;
    }),
  };
}
