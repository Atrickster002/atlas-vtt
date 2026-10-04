/**
 * How far a change of a note's template reaches, in the words the panel says
 * it (spec §5.5, §8.3, §13): a template only this note uses, one others
 * share, or a built-in, which is never changed itself: the change goes to the
 * collection's own copy of it, made once if it does not exist yet. Pure.
 */

import { Platform } from 'obsidian';

export type TemplateReach =
  /** A vault template only this statblock uses. */
  | { kind: 'own'; name: string }
  /** A vault template `count` statblocks use, this one included. */
  | { kind: 'shared'; name: string; count: number }
  /** A built-in whose copy the collection has: `count` statblocks use the copy once this one does. */
  | { kind: 'copy'; builtInName: string; copyId: string; count: number }
  /** A built-in the collection has no copy of yet: the change makes it. */
  | { kind: 'no-copy'; builtInName: string };

export interface ReachInput {
  builtIn: boolean;
  name: string;
  /** How many statblocks name the template, this one included. */
  usage: number;
  /** The collection's copy of the built-in and how many statblocks name it; null where it has none. */
  copy: { id: string; usage: number } | null;
  /** Whether this note already names the copy (it never does while it names the built-in). */
  onCopy?: boolean | undefined;
}

export function templateReachOf(input: ReachInput): TemplateReach {
  if (input.builtIn) {
    if (!input.copy) return { kind: 'no-copy', builtInName: input.name };
    return { kind: 'copy', builtInName: input.name, copyId: input.copy.id, count: input.copy.usage + (input.onCopy ? 0 : 1) };
  }
  return input.usage > 1 ? { kind: 'shared', name: input.name, count: input.usage } : { kind: 'own', name: input.name };
}

function statblocks(count: number): string {
  return `${count} statblock${count === 1 ? '' : 's'}`;
}

/** The template the change lands in, as the panel names it: "Hill folk", "your copy of 5E (2014 rules)". */
export function reachTarget(reach: TemplateReach): string {
  switch (reach.kind) {
    case 'own': case 'shared': return reach.name;
    case 'copy': case 'no-copy': return `your copy of ${reach.builtInName}`;
  }
}

/** The block menu's last row: "Remove Spells from Hill folk · 3 statblocks". */
export function removeRowText(reach: TemplateReach, block: string): string {
  switch (reach.kind) {
    case 'own': return `Remove ${block} from ${reach.name}`;
    case 'shared': return `Remove ${block} from ${reach.name} · ${statblocks(reach.count)}`;
    case 'copy': return `Remove ${block} from your copy of ${reach.builtInName} · ${statblocks(reach.count)}`;
    case 'no-copy': return `Remove ${block} (makes your own copy of ${reach.builtInName})`;
  }
}

/** The add menu's header row: "Adds to Hill folk · 3 statblocks (hidden where empty)". */
export function addHeaderText(reach: TemplateReach): string {
  switch (reach.kind) {
    case 'own': return `Adds to ${reach.name}`;
    case 'shared': return `Adds to ${reach.name} · ${statblocks(reach.count)} (hidden where empty)`;
    case 'copy': return `Adds to your copy of ${reach.builtInName} · ${statblocks(reach.count)}`;
    case 'no-copy': return `Adds to your own copy of ${reach.builtInName} (makes it now)`;
  }
}

/** How many statblocks a change of the template reaches. */
export function reachCount(reach: TemplateReach): number {
  switch (reach.kind) {
    case 'own': case 'no-copy': return 1;
    case 'shared': case 'copy': return reach.count;
  }
}

/** The toast after a removal: "Removed Spells from Hill folk. The values stay in the notes." */
export function removedToastText(reach: TemplateReach, block: string): string {
  const notes = reachCount(reach) > 1 ? 'the notes' : 'the note';
  return `Removed ${block} from ${reachTarget(reach)}. The values stay in ${notes}.`;
}

/** The toast after a copy was made for this note: "Made your own copy of 5E (2014 rules). Aboleth uses it now." */
export function copyMadeText(builtInName: string, note: string): string {
  return `Made your own copy of ${builtInName}. ${note} uses it now.`;
}

/** What the live region says after a removal, with the undo key. */
export function removedLiveText(reach: TemplateReach, block: string, mac: boolean = Platform.isMacOS): string {
  const count = reachCount(reach);
  const where = count > 1 ? `${reachTarget(reach)}, ${statblocks(count)}` : reachTarget(reach);
  return `Removed ${block} from ${where}. Press ${mac ? 'Command' : 'Ctrl'} Z to undo.`;
}
