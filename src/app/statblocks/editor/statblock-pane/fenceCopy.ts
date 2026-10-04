/**
 * Copy into a new statblock (§6.4): a ```statblock fence (or `statblock:
 * inline`) becomes a native note of a role of the collection, holding the
 * fence's values. The fence's note is never written: converting it in place
 * would break Fantasy Statblocks' rendering for whoever keeps the plugin.
 */

import { TFile, type App } from 'obsidian';
import { resolveCreatureFromFence } from '../../../services/FantasyStatblocksService';
import { decodeStatblockLinks } from '../../../services/statblockLinks';
import { noteName } from '../../../utils/pathUtils';
import { jsonRecordCopy } from '../../format/jsonValues';
import { isReservedKey } from '../../model/reservedKeys';
import type { FieldValue } from '../../model/templateTypes';
import { parseStatblockFence } from '../../notes/statblockSource';
import { createStatblock } from '../create/createFlow';

/** What a fence's statblock holds: its name and the values a native note keeps. */
export interface FenceValues {
  name: string;
  values: Record<string, FieldValue>;
}

/** A value with Fantasy Statblocks' encoded links written as the links they stand for, as the plugin does. */
export function withPlainLinks(value: FieldValue): FieldValue {
  if (typeof value === 'string') return decodeStatblockLinks(value);
  if (Array.isArray(value)) return value.map(withPlainLinks);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withPlainLinks(inner)]));
  }
  return value;
}

/**
 * The statblock a fence describes, as Fantasy Statblocks reads it while it is
 * loaded (a named creature, the linked note, the fence's own values on top),
 * else the fence's own values. Markers and Fantasy Statblocks' own keys are
 * left out; null when the note holds no fence.
 */
export async function fenceValues(app: App, path: string): Promise<FenceValues | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const params = parseStatblockFence(await app.vault.cachedRead(file))
    ?? (app.metadataCache.getFileCache(file)?.frontmatter?.statblock === 'inline' ? {} : null);
  if (!params) return null;
  const creature = jsonRecordCopy((await resolveCreatureFromFence(app, params, path)) ?? params) ?? {};
  const named = creature.name;
  const values: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(creature)) {
    if (key !== 'name' && !isReservedKey(key)) values[key] = withPlainLinks(value);
  }
  return { name: typeof named === 'string' && named.trim() ? named.trim() : noteName(path), values };
}

/**
 * Creates a native statblock of the role from the fence of the note at
 * `path`, and opens it. Returns the new note's path, or null
 * when nothing was made (no fence, or the note could not be written).
 */
export async function copyFenceIntoStatblock(app: App, path: string, collectionId: string | null, roleId: string): Promise<string | null> {
  const fence = await fenceValues(app, path);
  if (!fence) return null;
  return createStatblock(app, { collectionId, roleId, name: fence.name, values: fence.values, from: 'note' });
}
