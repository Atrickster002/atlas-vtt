/**
 * What a rolled cell says. Dice in backticks (`` `2d6` ``, Dice Roller's
 * `` `dice: 2d6` ``) are rolled with the result and their totals marked; a
 * link to a table (`[[Gems]]`, `[[Treasure#Gems]]`, `` `dice: [[Gems]]` ``)
 * rolls that table in place, and a link to a Base view (`[[Loot.base#Rare]]`,
 * or embedded as Obsidian writes it, `![[Loot.base#Rare]]`) draws an item of
 * it as the loot roller does. So a master table is a table whose rows link
 * smaller tables and views. Any other link, and plain dice text, stay as
 * written: a damage roll belongs to the moment it hits. Nesting stops at
 * `TABLE_LIMITS.depth`, at the results budget and at a table that reaches itself.
 */

import { rollLoot, toDraw, type LootDraw } from '../loot/lootRoller';
import type { LootItem } from '../loot/lootItem';
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
  /** Items drawn from linked Base views and linked Items tables, in the order they came up. */
  items: LootDraw[];
}

/** What a link names that rolls: a table in a note, or a view of a Base. */
export type LinkedTable =
  | {
    kind: 'table';
    /** The same for every link to this table, whatever its spelling: a loop is found by it. */
    key: string;
    table: RandomTable;
    /** The note holding it, for the links in its own cells. */
    notePath: string;
    /** Where the collection rolls the table as Items: the item of each row, in row order. */
    items?: readonly LootItem[];
  }
  | {
    kind: 'view';
    key: string;
    /** The items the view shows. */
    items: readonly LootItem[];
  };

/** Finds what links name; the reader of the collection's notes in Atlas, a map in tests. */
export interface TableResolver {
  /** What `link` (as written between `[[` and `]]`, without its alias) names from `fromPath`, or null. */
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
  /** Named after plain-number prices of drawn items, e.g. "gp". */
  currency?: string | undefined;
}

/** A backtick span or a wikilink, each on one line and bounded, so the scan stays linear. */
const TOKEN = /`([^`\n]{1,200})`|!?\[\[([^[\]\n]{1,500})\]\]/g;
const DICE_PREFIX = /^dice:\s*/i;
const LINK_ONLY = /^!?\[\[([^[\]\n]{1,500})\]\]$/;
const nothing = (): ResolvedCell => ({ text: '', rolls: [], stopped: [], items: [] });

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
  if (linked.kind === 'view') {
    const [item] = rollLoot(linked.items, { count: 1, currency: context.currency, random: context.random });
    return item ? { ...nothing(), text: item.name, items: [item] } : nothing();
  }
  const [draw] = rollTable(linked.table, { count: 1, random: context.random });
  if (!draw?.row) return nothing();
  const item = linked.items?.[draw.row.index];
  const cell = await resolveCell(draw.row.cells[0] ?? '', {
    ...context,
    fromPath: linked.notePath,
    trail: [...context.trail, linked.key],
  });
  return item ? { ...cell, items: [toDraw(item, context.currency), ...cell.items] } : cell;
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
  const items: LootDraw[] = [];
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
        items.push(...nested.items);
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
  return { text: text + cell.slice(last), rolls, stopped, items };
}
