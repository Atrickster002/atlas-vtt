/**
 * The words of the dialog after a Fantasy Statblocks import (§6.2, §6.4),
 * written for someone who never saw the layout's code: what Atlas can do
 * now, what of the look it cannot show, and what moving the statblocks does.
 */

import type { LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import type { FsImportReport } from '../../fs/fsLayoutTypes';
import { plural } from '../../../utils/plural';

/** "DaggerHeart Adversary is ready" */
export function readyTitle(layoutName: string): string {
  return `${layoutName} is ready`;
}

/** "Atlas can now show statblocks the way DaggerHeart Adversary does." */
export function readyLine(layoutName: string): string {
  return `Atlas can now show statblocks the way ${layoutName} does.`;
}

/** "One part shows only in Fantasy Statblocks."; null when Atlas shows every part. */
export function fsOnlyLine(parts: number): string | null {
  if (parts === 0) return null;
  return parts === 1 ? 'One part shows only in Fantasy Statblocks.' : `${parts} parts show only in Fantasy Statblocks.`;
}

/** What of the look Atlas left out or shows simpler; null where it kept all of it. */
export function detailsLine(report: FsImportReport | null): string | null {
  const left = (report?.dropped.length ?? 0) > 0;
  const simpler = (report?.partial.length ?? 0) > 0;
  if (left && simpler) return 'Some details were left out or look simpler.';
  if (left) return 'Some details were left out.';
  return simpler ? 'Some details look simpler.' : null;
}

/**
 * Each part the import shows only in Fantasy Statblocks, left out or shows simpler, in the
 * report's own sentences: the parts drawn with JavaScript first, as "Shown only in Fantasy
 * Statblocks: Hit points tracks drawn with JavaScript."
 */
export function detailSentences(report: FsImportReport | null): string[] {
  if (!report) return [];
  const scripts = report.scripts.map((script) => `Shown only in Fantasy Statblocks: ${script.summary}.`);
  return [...scripts, ...report.dropped, ...report.partial];
}

/** "Show the 3 details" */
export function detailsToggleLabel(count: number): string {
  return count === 1 ? 'Show the detail' : `Show the ${count} details`;
}

/** "Move 214 statblocks to Atlas" */
export function moveLabel(count: number): string {
  return `Move ${plural(count, 'statblock')} to Atlas`;
}

/** What moving the statblocks does, said once for what every one gets and once for those written into a note's text. */
export function moveExplanation(statblocks: LayoutStatblocks): string {
  const all = 'Moving your statblocks lets you open and edit them in Atlas; every value stays as it is.';
  if (statblocks.fences.length === 0) return all;
  return `${all} A statblock written into a note's text moves out of the text and shows beside the note.`;
}

/** What the list says of a statblock: only where it sits in its note's text, which moving changes. */
export function placeLabel(kind: keyof LayoutStatblocks): string | undefined {
  return kind === 'fences' ? 'In the note\'s text' : undefined;
}

/** What a batch did: "Moved 214 statblocks." or "Moved 12 of 214 statblocks." */
export function movedLine(moved: number, total: number): string {
  return moved === total ? `Moved ${plural(total, 'statblock')}.` : `Moved ${moved} of ${plural(total, 'statblock')}.`;
}

/** "Show the statblock left as it was", "Show the 3 statblocks left as they were". */
export function leftoversLabel(count: number): string {
  return count === 1 ? 'Show the statblock left as it was' : `Show the ${count} statblocks left as they were`;
}
