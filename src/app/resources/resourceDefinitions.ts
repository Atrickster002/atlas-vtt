import type { ResourceDefinition } from './resourceTypes';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const HP_RESOURCE: Readonly<ResourceDefinition> = {
  key: 'hp', name: 'HP', field: 'hp', direction: 'drains', look: 'bar',
  color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: false,
};

export const STRESS_RESOURCE: Readonly<ResourceDefinition> = {
  key: 'stress', name: 'Stress', field: 'stress', direction: 'fills', look: 'bar',
  color: '#a855f7', visibleToPlayers: false,
};

/** `Hit Protection` → `hit-protection`, unique among `taken` (`ammo`, `ammo-2`, …). */
export function resourceKey(name: string, taken: Iterable<string>): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'resource';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

const DRAFT_KEY_PREFIX = 'new:';

/** A placeholder key for a resource added in a dialog; `withFinalKeys` replaces it when the resource is saved. */
export function draftResourceKey(): string {
  return `${DRAFT_KEY_PREFIX}${crypto.randomUUID()}`;
}

export function isDraftResourceKey(key: string): boolean {
  return key.startsWith(DRAFT_KEY_PREFIX);
}

/**
 * `resources` as they are saved: one added in a dialog takes its key from the
 * name it has now, so adding "Ammo" again after deleting it finds the values
 * tokens still hold. Saved resources keep their key whatever they are renamed to.
 */
export function withFinalKeys(resources: readonly ResourceDefinition[]): ResourceDefinition[] {
  const taken = resources.filter((resource) => !isDraftResourceKey(resource.key)).map((resource) => resource.key);
  return resources.map((resource) => {
    if (!isDraftResourceKey(resource.key)) return resource;
    const key = resourceKey(resource.name, taken);
    taken.push(key);
    return { ...resource, key };
  });
}

/** A stored or imported definition, or null when a required part is missing or invalid. */
export function parseResourceDefinition(raw: unknown): ResourceDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
  const key = text(r.key);
  const name = text(r.name);
  const field = text(r.field);
  if (!key || !name || !field) return null;
  if (r.direction !== 'drains' && r.direction !== 'fills') return null;
  if (r.look !== 'bar' && r.look !== 'badge') return null;
  if (typeof r.color !== 'string' || !HEX_COLOR.test(r.color)) return null;
  return {
    key, name, field: field.trim(), direction: r.direction, look: r.look, color: r.color,
    ...(r.defeatedWhenSpent === true && { defeatedWhenSpent: true }),
    visibleToPlayers: r.visibleToPlayers === true,
  };
}

export function parseResourceDefinitions(raw: unknown): ResourceDefinition[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.map(parseResourceDefinition).filter((d): d is ResourceDefinition => {
    if (!d || seen.has(d.key)) return false;
    seen.add(d.key);
    return true;
  });
}

function sameDefinition(a: ResourceDefinition, b: ResourceDefinition): boolean {
  return a.key === b.key && a.name === b.name && a.field === b.field && a.direction === b.direction
    && a.look === b.look && a.color.toLowerCase() === b.color.toLowerCase()
    && !!a.defeatedWhenSpent === !!b.defeatedWhenSpent && a.visibleToPlayers === b.visibleToPlayers;
}

export function sameResourceDefinitions(
  a: readonly ResourceDefinition[] | undefined,
  b: readonly ResourceDefinition[] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((d, i) => sameDefinition(d, right[i]!));
}
