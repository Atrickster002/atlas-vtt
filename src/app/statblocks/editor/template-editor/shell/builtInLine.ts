/**
 * What the template editor's footer says about a built-in and its copies
 * (spec §9.1, §9.3, §13): before the first change of a built-in, where the
 * change goes; on the collection's own copy, how many statblocks still use
 * the built-in, which may switch. Pure, from what the caller read.
 */

export interface BuiltInFacts {
  builtInName: string;
  /** The collection's copy of the built-in and how many statblocks name it; null where it has none yet. */
  copy: { name: string; usage: number } | null;
  /** The note this editor was opened from, by name. */
  fromNote: string | null;
}

function statblocks(count: number): string {
  return `${count} statblock${count === 1 ? '' : 's'}`;
}

/** "Built in. Your first change makes your own copy for Aboleth." */
export function builtInLine(facts: BuiltInFacts): string {
  if (facts.copy) return `Built in. Your changes go to your copy of ${facts.builtInName} · ${statblocks(facts.copy.usage)}.`;
  return facts.fromNote
    ? `Built in. Your first change makes your own copy for ${facts.fromNote}.`
    : 'Built in. Your first change makes your own copy.';
}

/** "11 more on 5E (2014 rules) · Switch…": the statblocks still on the built-in a copy was made of. */
export function switchChipText(builtInName: string, count: number): string {
  return `${count} more on ${builtInName} · Switch…`;
}
