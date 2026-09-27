import type { LootProperty } from './lootRoller';

/** One note of a base view's results, with the values Atlas needs as text. */
export interface LootQueryEntry {
  /** Vault path of the item note. */
  path: string;
  /** The note's name. */
  name: string;
  /** Property id (`note.price`, `formula.value`…) → value as text; empty values are left out. */
  values: Record<string, string>;
}

/** What a base view gave Atlas: its entries and how it shows their properties. */
export interface LootQuerySnapshot {
  entries: LootQueryEntry[];
  /** The view's visible properties, in their order. */
  order: string[];
  /** Property id → the name the base shows for it. */
  displayNames: Record<string, string>;
}

/** An item that can be rolled: an item note of a base view. */
export interface LootItem {
  /** The item note's path; the same note in two views is one item. */
  id: string;
  name: string;
  /** The base and view it came from, e.g. ["Daggerheart Items", "Armor"]. */
  source: string[];
  price?: string;
  rarity?: string;
  type?: string;
  description?: string;
  properties: LootProperty[];
}

/** Property ids the roller reads by name, whatever the game system calls the rest. */
const ROLE_PATTERNS = {
  price: /^(price|cost|value|gold|worth)$/i,
  rarity: /^(rarity|quality)$/i,
  type: /^(type|item[ _-]?type|category|kind|slot)$/i,
  description: /^(description|effect|effects|feature|features|details|text)$/i,
} as const;

type Role = keyof typeof ROLE_PATTERNS;

/** Shown in the source line of a card or not at all. */
const HIDDEN = /^(source|page|book|tags|aliases|cssclasses)$/i;

/** `note.price` → `price`; file and formula properties keep their prefix out of the way too. */
function propertyKey(id: string): string {
  return id.slice(id.indexOf('.') + 1);
}

/** The property filling each role: the first of the view's properties whose name fits. */
export function roleProperties<Id extends string>(propertyIds: readonly Id[]): Partial<Record<Role, Id>> {
  const roles: Partial<Record<Role, Id>> = {};
  for (const role of Object.keys(ROLE_PATTERNS) as Role[]) {
    const id = propertyIds.find((candidate) => !candidate.startsWith('file.') && ROLE_PATTERNS[role].test(propertyKey(candidate)));
    if (id) roles[role] = id;
  }
  return roles;
}

/** The loot items of one base view. */
export function toLootItems(snapshot: LootQuerySnapshot, source: string[]): LootItem[] {
  const known = [...new Set([...snapshot.order, ...snapshot.entries.flatMap((entry) => Object.keys(entry.values))])];
  const roles = roleProperties(known);
  const roleIds = new Set(Object.values(roles));
  const shown = snapshot.order.filter((id) => !id.startsWith('file.') && !roleIds.has(id) && !HIDDEN.test(propertyKey(id)));

  return snapshot.entries.map((entry) => {
    const value = (role: Role): string | undefined => {
      const id = roles[role];
      return id ? entry.values[id] : undefined;
    };
    const price = value('price');
    const rarity = value('rarity');
    const type = value('type');
    const description = value('description');
    return {
      id: entry.path,
      name: entry.name,
      source,
      ...(price && { price }),
      ...(rarity && { rarity }),
      ...(type && { type }),
      ...(description && { description }),
      properties: shown.flatMap((id) => {
        const text = entry.values[id];
        return text ? [{ label: snapshot.displayNames[id] ?? propertyKey(id), value: text }] : [];
      }),
    };
  });
}
