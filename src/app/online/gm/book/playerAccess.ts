import { abilityFieldKeys } from '../../../statblocks/model/abilityParts';
import { fieldByKey } from '../../../statblocks/model/fieldKeys';
import { displayNameKey, headerKey } from '../../../statblocks/model/templateHeader';
import type { FieldKey, PlayerAccess, StatblockTemplate, TemplateBlock, TemplateField } from '../../../statblocks/model/templateTypes';

/** How much each setting lets a player do; the stricter of two wins where one block shows several fields. */
const RANK: Readonly<Record<PlayerAccess, number>> = { edit: 2, read: 1, hidden: 0 };

/** The stricter of two settings. */
export function stricter(a: PlayerAccess, b: PlayerAccess): PlayerAccess {
  return RANK[a] <= RANK[b] ? a : b;
}

/** The fields whose value a player only ever reads, whatever the template says: the name the header shows and the token art. */
function isFixedRead(template: StatblockTemplate, field: TemplateField): boolean {
  const fixed = [headerKey(template.fields, 'name'), headerKey(template.fields, 'token'), displayNameKey(template.fields)];
  return fixed.includes(field.key) || field.type === 'image';
}

/** The setting the template stores for a field: under its key, else under one it had before a rename, newest first. */
function storedAccess(template: StatblockTemplate, field: TemplateField): PlayerAccess | undefined {
  const players = template.players;
  if (!players) return undefined;
  for (const key of [field.key, ...(field.formerKeys ?? [])]) {
    if (Object.hasOwn(players, key)) return players[key];
  }
  return undefined;
}

/**
 * What a player may do with one field of their own character's statblock. By default they change
 * every value, and every ability of a list; a spell list in Fantasy Statblocks' shape they only read
 * (or not at all); the name and the token art they always read. A template stores only where it
 * differs from that (`StatblockTemplate.players`). A key the template names nowhere is hidden: the
 * note may hold anything, and a player gets only what the template shows.
 */
export function playerAccess(template: StatblockTemplate, key: FieldKey): PlayerAccess {
  const field = fieldByKey(template.fields, key);
  if (!field) return 'hidden';
  if (isFixedRead(template, field)) return 'read';
  const stored = storedAccess(template, field);
  if (field.type === 'spells') return stored === 'hidden' ? 'hidden' : 'read';
  return stored ?? 'edit';
}

/**
 * What a player may do with what a block shows. An Abilities component (a list, or a list split
 * into tabs) is set for all its lists at once, so the strictest of them decides; a Track bound to a
 * token resource is only read here, since the player changes it as that resource; a Line that writes
 * several values or a pattern is read as worked out, and hidden where one of its values is. A
 * Metric shows wherever one of its numbers does, each number set on its own. Values a block works
 * out by itself (a fallback, a Table's worked-out row) have no field and are never changed.
 */
export function blockAccess(template: StatblockTemplate, block: TemplateBlock): PlayerAccess {
  const lists = abilityFieldKeys(block);
  if (lists.length > 0) return lists.map((key) => playerAccess(template, key)).reduce(stricter);
  switch (block.type) {
    case 'script': case 'opaque': return 'hidden';
    case 'section': case 'row': case 'tabs': case 'heading': case 'divider': return 'read';
    case 'metric': return block.fields.filter((key) => key !== '').map((key) => playerAccess(template, key)).reduce(laxer, 'hidden');
    case 'line': {
      const access = block.fields.map((key) => playerAccess(template, key)).reduce(stricter, 'edit');
      return block.fields.length === 1 && block.pattern === undefined ? access : stricter(access, 'read');
    }
    case 'track': return block.resource === undefined ? playerAccess(template, block.field) : stricter(playerAccess(template, block.field), 'read');
    case 'text': return block.field === undefined ? 'read' : playerAccess(template, block.field);
    default: return playerAccess(template, block.field);
  }
}

/** The laxer of two settings. */
function laxer(a: PlayerAccess, b: PlayerAccess): PlayerAccess {
  return RANK[a] >= RANK[b] ? a : b;
}
