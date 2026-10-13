/**
 * What the import report says (§6.2): "11 blocks imported. 2 scripts kept for
 * Fantasy Statblocks (…). Replace them with Track blocks?", and the words of
 * the batch that moves a layout's statblocks to Atlas (§6.4).
 */

import type { LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import type { FsImportReport } from '../../fs/fsLayoutTypes';
import { plural } from '../../../utils/plural';

/** Scripts named in the summary's brackets; the rest are counted. */
const NAMED_SCRIPTS = 3;

/** "11 blocks imported." */
export function blocksLine(report: FsImportReport): string {
  return `${plural(report.blocks, 'block')} imported.`;
}

/** "2 scripts kept for Fantasy Statblocks (…)."; null without scripts. */
export function scriptsLine(report: FsImportReport): string | null {
  const { scripts } = report;
  if (scripts.length === 0) return null;
  const named = scripts.slice(0, NAMED_SCRIPTS).map((script) => script.summary);
  const rest = scripts.length - named.length;
  const list = rest > 0 ? [...named, `${rest} more`].join('; ') : named.join('; ');
  return `${plural(scripts.length, 'script')} kept for Fantasy Statblocks (${list}).`;
}

/** How many of the scripts draw tracks that Track blocks can draw instead. */
export function trackScriptCount(report: FsImportReport): number {
  return report.scripts.filter((script) => script.suggestion === 'track').length;
}

/** "Replace them with Track blocks?"; null when no script draws tracks. */
export function replaceQuestion(report: FsImportReport): string | null {
  const tracks = trackScriptCount(report);
  if (tracks === 0) return null;
  if (tracks === report.scripts.length) return tracks === 1 ? 'Replace it with Track blocks?' : 'Replace them with Track blocks?';
  return tracks === 1 ? 'Replace the one that draws tracks with Track blocks?' : `Replace the ${tracks} that draw tracks with Track blocks?`;
}

/** "Move 214 statblocks to Atlas". */
export function moveLabel(count: number): string {
  return `Move ${plural(count, 'statblock')} to Atlas`;
}

/** What the batch does to each kind it holds. */
export function moveExplanation(statblocks: LayoutStatblocks): string {
  const inProperties = 'Statblocks in properties keep their values and layout.';
  const inBlocks = 'A code block becomes its note\'s properties and leaves the note; the rest of the note stays as it is.';
  if (statblocks.fences.length === 0) return inProperties;
  return statblocks.frontmatter.length === 0 ? inBlocks : `${inProperties} ${inBlocks}`;
}

/** How a statblock is written in its note, as the list says it. */
export function kindLabel(kind: keyof LayoutStatblocks): string {
  return kind === 'frontmatter' ? 'Properties' : 'Code block';
}

/** What a batch did: "Moved 214 statblocks." or "Moved 12 of 214 statblocks." */
export function movedLine(moved: number, total: number): string {
  return moved === total ? `Moved ${plural(total, 'statblock')}.` : `Moved ${moved} of ${plural(total, 'statblock')}.`;
}

/** "Show the statblock left as it was", "Show the 3 statblocks left as they were". */
export function leftoversLabel(count: number): string {
  return count === 1 ? 'Show the statblock left as it was' : `Show the ${count} statblocks left as they were`;
}

/** "The template keeps 2 scripts for Fantasy Statblocks (…); Atlas shows them as placeholders."; null without scripts. */
export function keptScriptsLine(summaries: readonly string[]): string | null {
  if (summaries.length === 0) return null;
  const named = summaries.slice(0, NAMED_SCRIPTS);
  const rest = summaries.length - named.length;
  const list = rest > 0 ? [...named, `${rest} more`].join('; ') : named.join('; ');
  const shown = summaries.length === 1 ? 'shows it as a placeholder' : 'shows them as placeholders';
  return `The template keeps ${plural(summaries.length, 'script')} for Fantasy Statblocks (${list}); Atlas ${shown}.`;
}
