import { TFile, type App } from 'obsidian';
import {
  getFantasyStatblocksApi,
  resolveCreatureFromFence,
  type FantasyStatblocksApi,
  type FantasyStatblocksCreature,
} from '../services/FantasyStatblocksService';
import type { StatblockSource } from '../statblocks/model/resolvedTypes';
import { cachedFrontmatter, type FrontmatterRecord } from '../statblocks/notes/statblockSource';

/** The bestiary as one lookup, built once and reused for many notes. */
export interface BestiaryLookup {
  api: FantasyStatblocksApi | null;
  byPath: ReadonlyMap<string, FantasyStatblocksCreature>;
}

/** Fantasy Statblocks' note-backed creatures by note path; empty while the plugin is missing. */
export function bestiaryLookup(): BestiaryLookup {
  const api = getFantasyStatblocksApi();
  const byPath = new Map<string, FantasyStatblocksCreature>();
  for (const creature of api?.getBestiaryCreatures() ?? []) {
    if (creature.path) byPath.set(creature.path, creature);
  }
  return { api, byPath };
}

/** A bestiary creature with its `extends` applied, which only the plugin's name lookup does. */
function withExtensions(api: FantasyStatblocksApi | null, creature: FantasyStatblocksCreature): FantasyStatblocksCreature {
  if (!api || creature.extends === undefined) return creature;
  const resolved = api.getCreatureFromBestiary(creature.name);
  return resolved && resolved.path === creature.path ? resolved : creature;
}

/** A statblock record from frontmatter, as Fantasy Statblocks' watcher parses it: named after the note when it names nothing. */
export function frontmatterCreature(frontmatter: FrontmatterRecord, path: string): FantasyStatblocksCreature {
  const basename = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
  const name = typeof frontmatter.name === 'string' && frontmatter.name.trim() ? frontmatter.name : basename;
  return { ...frontmatter, name, path };
}

function markdownFile(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile && file.extension === 'md' ? file : null;
}

/**
 * The creature a statblock note describes, given what the predicate found in
 * it (`statblockSourceOf`). Native notes read only their own frontmatter, never
 * the bestiary's copy, which lags behind Atlas' writes. Everything else keeps
 * Fantasy Statblocks' order: its bestiary entry when the plugin parsed the
 * note, else the note's frontmatter (the plugin parses notes only with "auto
 * parse" on), else the note's ```statblock fence, else the bestiary creature
 * of the note's name, as token links always have.
 */
export async function linkedCreatureFor(
  app: App,
  notePath: string,
  source: StatblockSource | null,
  bestiary: BestiaryLookup,
): Promise<FantasyStatblocksCreature | null> {
  const { api, byPath } = bestiary;
  const parsed = source?.kind === 'atlas' ? undefined : byPath.get(notePath);
  if (parsed) return withExtensions(api, parsed);

  const file = markdownFile(app, notePath);
  if (file && (source?.kind === 'atlas' || source?.kind === 'fs-frontmatter')) {
    return frontmatterCreature(cachedFrontmatter(app, file) ?? {}, notePath);
  }
  if (source?.kind === 'fs-fence') {
    const creature = await resolveCreatureFromFence(app, source.params, notePath);
    if (creature) return { ...creature, path: notePath };
  }

  const basename = notePath.split('/').pop()?.replace(/\.md$/, '') ?? '';
  return basename && api?.hasCreature(basename) ? api.getCreatureFromBestiary(basename) : null;
}
