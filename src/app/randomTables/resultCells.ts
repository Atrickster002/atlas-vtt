/**
 * What a rolled cell says. Dice in backticks (`` `2d6` ``, Dice Roller's
 * `` `dice: 2d6` ``) are rolled with the result and their totals marked; a
 * link to a table (`[[Gems]]`, `[[Treasure#Gems]]`, `` `dice: [[Gems]]` ``)
 * rolls that table in place. Any other link, and plain dice text, stay as
 * written: a damage roll belongs to the moment it hits. Nesting stops at
 * `TABLE_LIMITS.depth`, at the results budget and at a table that reaches itself.
 */

import { rollFormula } from '../tools/diceFormula';
import { parseFormula, type ParsedFormula } from '../tools/parseFormula';
import { TABLE_LIMITS, type RandomTable } from './tableModel';
import { rollTable } from './tableRoller';

/** A number rolled inside the text: its formula, its total and where the total stands. */
export interface RolledNumber {
  formula: string;
  total: number;
  /** Index of the total's first character in the cell's text. */
  at: number;
}

/** Why a link to a table stayed a link. */
export type NestingStop = 'loop' | 'depth' | 'results';

export interface ResolvedCell {
  text: string;
  rolls: RolledNumber[];
  /** Links to tables that were not rolled, and why. */
  stopped: NestingStop[];
}

/** A table a link names. */
export interface LinkedTable {
  /** The same for every link to this table, whatever its spelling: a loop is found by it. */
  key: string;
  table: RandomTable;
  /** The note holding it, for the links in its own cells. */
  notePath: string;
}

/** Finds the tables links name; the reader of the collection's notes in Atlas, a map in tests. */
export interface TableResolver {
  /** The table `link` (as written between `[[` and `]]`, without its alias) names from `fromPath`, or null. */
  resolve(link: string, fromPath: string): Promise<LinkedTable | null>;
}

export interface CellContext {
  resolver: TableResolver;
  /** The note the cell stands in. */
  fromPath: string;
  random: () => number;
  /** Keys of the tables rolled on the way to this cell, the outermost first. */
  trail: readonly string[];
  /** Nested results still allowed in this roll; shared by every cell of it. */
  budget: { results: number };
}

/** A backtick span or a wikilink, each on one line and bounded, so the scan stays linear. */
const TOKEN = /`([^`\n]{1,200})`|\[\[([^[\]\n]{1,500})\]\]/g;
const DICE_PREFIX = /^dice:\s*/i;
const LINK_ONLY = /^\[\[([^[\]\n]{1,500})\]\]$/;

/** A formula that rolls at least one die, or null for anything else (code, a plain number, refused dice). */
function diceFormula(text: string): ParsedFormula | null {
  const parsed = parseFormula(text);
  return parsed.ok && parsed.terms.some((term) => term.kind === 'dice') ? parsed : null;
}

function linkTarget(inner: string): string {
  return inner.split('|')[0]!.trim();
}

/** The text a linked table rolls into, or null to keep the link as written. */
async function rollLinked(target: string, context: CellContext, stopped: NestingStop[]): Promise<ResolvedCell | null> {
  const linked = await context.resolver.resolve(target, context.fromPath);
  if (!linked) return null;
  if (context.trail.includes(linked.key)) return stop('loop', stopped);
  if (context.trail.length >= TABLE_LIMITS.depth) return stop('depth', stopped);
  if (context.budget.results <= 0) return stop('results', stopped);
  context.budget.results--;
  const [draw] = rollTable(linked.table, { count: 1, random: context.random });
  if (!draw?.row) return { text: '', rolls: [], stopped: [] };
  return resolveCell(draw.row.cells[0] ?? '', {
    ...context,
    fromPath: linked.notePath,
    trail: [...context.trail, linked.key],
  });
}

function stop(reason: NestingStop, stopped: NestingStop[]): null {
  stopped.push(reason);
  return null;
}

/** The cell's text with its dice rolled and its table links rolled in place. */
export async function resolveCell(cell: string, context: CellContext): Promise<ResolvedCell> {
  let text = '';
  const rolls: RolledNumber[] = [];
  const stopped: NestingStop[] = [];
  let last = 0;
  for (const match of cell.matchAll(TOKEN)) {
    const written = match[0];
    text += cell.slice(last, match.index);
    last = match.index + written.length;

    const code = match[1]?.trim();
    const linkInner = match[2] ?? (code ? LINK_ONLY.exec(code.replace(DICE_PREFIX, ''))?.[1] : undefined);
    if (linkInner !== undefined) {
      const nested = await rollLinked(linkTarget(linkInner), context, stopped);
      if (nested) {
        rolls.push(...nested.rolls.map((roll) => ({ ...roll, at: roll.at + text.length })));
        stopped.push(...nested.stopped);
        text += nested.text;
      } else {
        text += written;
      }
      continue;
    }

    const formula = code?.replace(DICE_PREFIX, '');
    const parsed = formula === undefined ? null : diceFormula(formula);
    if (!parsed || formula === undefined) {
      text += written;
      continue;
    }
    const total = rollFormula(parsed, context.random).total;
    rolls.push({ formula, total, at: text.length });
    text += String(total);
  }
  return { text: text + cell.slice(last), rolls, stopped };
}
