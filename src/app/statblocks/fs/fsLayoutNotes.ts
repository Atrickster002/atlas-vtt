/**
 * Fantasy Statblocks statblocks and the layouts they are drawn with (§6.4):
 * which frontmatter statblocks a layout draws, read from the metadata cache,
 * and adopting them as one batch of `atlas-template` patches. `layout:`
 * stays in every note, so Fantasy Statblocks draws them as before.
 */

import type { App, TFile } from 'obsidian';
import { allLayouts, defaultLayout, findLayout } from '../../services/FantasyStatblocksService';
import type { TemplateId } from '../model/templateTypes';
import { cachedFrontmatter, frontmatterSource, type FrontmatterRecord } from '../notes/statblockSource';
import { switchTemplates, type TemplateSwitchOptions, type TemplateSwitchResult } from '../notes/templateSwitch';
import { identityOf, type LayoutIdentity } from './fsImport';
import type { FsLayout } from './fsLayoutTypes';

/** The layouts the statblocks of a collection are drawn with, each with its notes. */
export interface LayoutNotes {
  layout: LayoutIdentity;
  notes: string[];
}

const BY_PATH = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** The layout a frontmatter statblock names in `layout:`; null when it names none. */
export function layoutKeyOf(frontmatter: FrontmatterRecord | null | undefined): string | null {
  const key = frontmatter?.layout;
  return typeof key === 'string' && key.trim() !== '' ? key.trim() : null;
}

/** Whether two names of layouts name the same one: the same id, else the same name. */
export function sameLayout(a: LayoutIdentity, b: LayoutIdentity): boolean {
  return (a.id !== '' && a.id === b.id) || (a.name !== '' && a.name === b.name);
}

/**
 * How the layout of a note is read: as Fantasy Statblocks draws it (the
 * layout it names, else the plugin's default), or, without the plugin, by the
 * name it gives, and none when it gives none. Read once for many notes.
 */
export function noteLayoutReader(app: App): (frontmatter: FrontmatterRecord | null | undefined) => LayoutIdentity | null {
  const loaded = allLayouts(app) !== null;
  const fallback = loaded ? defaultLayout(app) : null;
  return (frontmatter) => {
    const key = layoutKeyOf(frontmatter);
    const layout = (loaded && key !== null ? findLayout(app, key) : null) ?? (loaded ? fallback : null);
    if (layout) return identityOf(layout);
    return key === null ? null : { id: key, name: key };
  };
}

/** The layout a frontmatter statblock is drawn with; see `noteLayoutReader`. */
export function noteLayout(app: App, frontmatter: FrontmatterRecord | null | undefined): LayoutIdentity | null {
  return noteLayoutReader(app)(frontmatter);
}

/** The layout of Fantasy Statblocks that draws a frontmatter statblock, to import; null without the plugin. */
export function noteFsLayout(app: App, frontmatter: FrontmatterRecord | null | undefined): FsLayout | null {
  if (allLayouts(app) === null) return null;
  const key = layoutKeyOf(frontmatter);
  return (key !== null ? findLayout(app, key) : null) ?? defaultLayout(app);
}

/** Fantasy Statblocks' frontmatter statblocks among `paths`, or in the whole vault. */
function frontmatterStatblocks(app: App, paths?: readonly string[]): Array<{ path: string; frontmatter: FrontmatterRecord }> {
  const files = paths
    ? paths.map((path) => app.vault.getFileByPath(path)).filter((file): file is TFile => file !== null)
    : app.vault.getMarkdownFiles();
  return files.flatMap((file) => {
    const frontmatter = cachedFrontmatter(app, file);
    return frontmatter && frontmatterSource(frontmatter)?.kind === 'fs-frontmatter' ? [{ path: file.path, frontmatter }] : [];
  });
}

/** The frontmatter statblocks among `paths` (every note when absent) that the layout draws, by path. */
export function notesUsingLayout(app: App, layout: LayoutIdentity, paths?: readonly string[]): string[] {
  const read = noteLayoutReader(app);
  return frontmatterStatblocks(app, paths)
    .filter(({ frontmatter }) => {
      const used = read(frontmatter);
      return used !== null && sameLayout(used, layout);
    })
    .map(({ path }) => path)
    .sort((a, b) => BY_PATH.compare(a, b));
}

/** The layouts that draw the frontmatter statblocks among `paths`, the most used first. */
export function layoutsOfNotes(app: App, paths: readonly string[]): LayoutNotes[] {
  const read = noteLayoutReader(app);
  const groups: LayoutNotes[] = [];
  for (const { path, frontmatter } of frontmatterStatblocks(app, [...new Set(paths)])) {
    const layout = read(frontmatter);
    if (!layout) continue;
    const group = groups.find((candidate) => sameLayout(candidate.layout, layout));
    if (group) group.notes.push(path);
    else groups.push({ layout, notes: [path] });
  }
  for (const group of groups) group.notes.sort((a, b) => BY_PATH.compare(a, b));
  return groups.sort((a, b) => b.notes.length - a.notes.length || BY_PATH.compare(a.layout.name, b.layout.name));
}

/**
 * Adopts statblocks of Fantasy Statblocks: `atlas-template` is written into
 * each note that still names no template, one note after the other, with
 * progress and Cancel. A note that names one meanwhile keeps it.
 */
export function adoptStatblocks(
  app: App, paths: readonly string[], templateId: TemplateId, options: TemplateSwitchOptions = {},
): Promise<TemplateSwitchResult> {
  return switchTemplates(app, paths.map((path) => ({ path, from: null })), templateId, options);
}
