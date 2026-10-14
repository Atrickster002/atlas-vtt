/**
 * A statblock note's fields as tokens read them (resources, initiative): the
 * resolver's fields with the note's own frontmatter laid over them, and the
 * meanings of its template.
 */

import { TFile, type App } from 'obsidian';
import { boundedFields } from '../../creatures/statblockValues';
import { isBestiaryResolved } from '../../services/FantasyStatblocksService';
import { NO_MEANINGS, type FieldMeanings } from './fieldMeanings';
import { readStatblock } from './readStatblock';

export interface StatblockRecord {
  /** The statblock's fields as the resolver gives them, with the note's frontmatter laid over them. */
  record: Record<string, unknown>;
  /** What the fields of the statblock's template mean (hit points, rating under other keys). */
  meanings: FieldMeanings;
}

/**
 * The record of a statblock note; null where the note is none. While Fantasy Statblocks
 * still parses the vault, a creature read by name is not there yet and one that extends
 * another comes without it: with `wholeOnly` such a statblock gives null.
 */
export async function readStatblockRecord(app: App, statblockPath: string, wholeOnly = false): Promise<StatblockRecord | null> {
  const file = app.vault.getAbstractFileByPath(statblockPath);
  if (!(file instanceof TFile)) return null;

  const noted: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
  const frontmatter = noted ? boundedFields(noted) : undefined;
  // Asked before the read: a parse that ends meanwhile does not make what was read whole.
  const parsing = !isBestiaryResolved();
  const statblock = await readStatblock(app, statblockPath);
  if (!frontmatter && !statblock) return null;
  if (wholeOnly && parsing && (!statblock || statblock.fields.extends !== undefined)) return null;
  return { record: { ...statblock?.fields, ...frontmatter }, meanings: statblock?.meanings ?? NO_MEANINGS };
}
