/**
 * What the import report says (§6.2): "11 blocks imported. 2 scripts kept for
 * Fantasy Statblocks (…). Replace them with Track blocks?", and the label of
 * the adoption batch (§6.4).
 */

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

/** "Use Marsh creature for the 214 notes using layout Basic 5e". */
export function adoptLabel(templateName: string, count: number, layoutName: string): string {
  const notes = count === 1 ? 'the note' : `the ${count} notes`;
  return `Use ${templateName} for ${notes} using layout ${layoutName}`;
}

/** What a batch did: "Switched 214 notes." or "Switched 12 of 214 notes." */
export function adoptedLine(switched: number, total: number): string {
  return switched === total ? `Switched ${plural(total, 'note')}.` : `Switched ${switched} of ${plural(total, 'note')}.`;
}
