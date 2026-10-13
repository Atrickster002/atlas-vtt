import { isFiniteNumber, isRecord, isStringArray } from '../utils/guards';
import type { LootDraw, LootProperty } from './lootRoller';
import { isRarityTone } from './lootRarity';

/** A column of a rolled row beside its result text. */
export interface TableResultField {
  label: string;
  value: string;
  /** A column only the GM sees (a rumour's "True?"). */
  hidden?: true;
}

/** A number rolled inside a result's text: its dice, its total and where the total stands in the text. */
export interface TableResultRoll {
  formula: string;
  total: number;
  /** Index of the total's first character in the text. */
  at: number;
}

/** One result of a roll on a table that is no Items table, copied out of its note. */
export interface TableResult {
  id: string;
  /** Where it comes from: [note name, table name]. */
  source: string[];
  /** The note, for Open note; never sent to players. */
  notePath: string;
  /** The die read, as shown: "d6", 4. Absent for weighted tables. */
  roll?: { die: string; total: number };
  /** The first result column, its dice and linked tables rolled. */
  text: string;
  /** The numbers dice in the text rolled, to mark them; absent where none were rolled. */
  rolls?: TableResultRoll[];
  /** The other columns; `hidden` ones are the GM's. */
  fields: TableResultField[];
}

/**
 * One press of the Roll button: the items it drew and the results of other tables, when and
 * on which map. A roll without items keeps `draws` empty, so earlier versions, whose reader
 * needs a valid draw, leave it out whole rather than show half of it.
 */
export interface LootRoll {
  id: string;
  /** Unix time in milliseconds. */
  rolledAt: number;
  /** Name of the map the roll was made on. */
  mapName: string;
  draws: LootDraw[];
  results?: TableResult[];
}

/** Rolls kept per collection, newest first, of every kind. */
export const LOOT_HISTORY_LIMIT = 100;

function isLootProperty(value: unknown): value is LootProperty {
  return isRecord(value) && typeof value.label === 'string' && typeof value.value === 'string';
}

function isLootDraw(value: unknown): value is LootDraw {
  if (!isRecord(value)) return false;
  const { id, notePath, source, name, price, description, type, rarity, properties } = value;
  return typeof id === 'string'
    && typeof notePath === 'string'
    && isStringArray(source)
    && typeof name === 'string'
    && (price === undefined || typeof price === 'string')
    && (description === undefined || typeof description === 'string')
    && (type === undefined || typeof type === 'string')
    && (rarity === undefined || typeof rarity === 'string')
    && Array.isArray(properties) && properties.every(isLootProperty);
}

/** A saved draw with a tone this Atlas paints; a tone it does not know is dropped, the draw kept. */
function checkedDraw(draw: LootDraw): LootDraw {
  const { tone, ...rest } = draw;
  return isRarityTone(tone) ? { ...rest, tone } : rest;
}

function isResultField(value: unknown): value is TableResultField {
  return isRecord(value) && typeof value.label === 'string' && typeof value.value === 'string'
    && (value.hidden === undefined || value.hidden === true);
}

function isResultRoll(value: unknown, text: string): value is TableResultRoll {
  if (!isRecord(value) || typeof value.formula !== 'string' || !isFiniteNumber(value.total) || !isFiniteNumber(value.at)) return false;
  return Number.isInteger(value.at) && value.at >= 0 && text.startsWith(String(value.total), value.at);
}

/** A saved result with its marks of rolled numbers checked: a mark that does not stand on its number is dropped. */
function checkedResult(result: TableResult): TableResult {
  const { rolls, ...rest } = result;
  const valid = Array.isArray(rolls) ? rolls.filter((roll) => isResultRoll(roll, result.text)) : [];
  return { ...rest, ...(valid.length > 0 && { rolls: valid }) };
}

function isTableResult(value: unknown): value is TableResult {
  if (!isRecord(value)) return false;
  const { id, source, notePath, roll, text, fields } = value;
  return typeof id === 'string'
    && isStringArray(source)
    && typeof notePath === 'string'
    && (roll === undefined || (isRecord(roll) && typeof roll.die === 'string' && isFiniteNumber(roll.total)))
    && typeof text === 'string'
    && Array.isArray(fields) && fields.every(isResultField);
}

/** A saved roll, or null when the data is not one; its broken items and results are dropped. */
export function readLootRoll(value: unknown): LootRoll | null {
  if (!isRecord(value)) return null;
  const { id, rolledAt, mapName, draws, results } = value;
  if (typeof id !== 'string' || !isFiniteNumber(rolledAt) || typeof mapName !== 'string' || !Array.isArray(draws)) return null;
  const valid = draws.filter(isLootDraw).map(checkedDraw);
  const validResults = Array.isArray(results) ? results.filter(isTableResult).map(checkedResult) : [];
  if (valid.length === 0 && validResults.length === 0) return null;
  return { id, rolledAt, mapName, draws: valid, ...(validResults.length > 0 && { results: validResults }) };
}

/** The rolls of a collection's history file, which arrives unchecked. */
export function readLootHistory(value: unknown): LootRoll[] {
  const rolls = isRecord(value) ? value.rolls : undefined;
  if (!Array.isArray(rolls)) return [];
  return rolls.flatMap((roll) => readLootRoll(roll) ?? []).slice(0, LOOT_HISTORY_LIMIT);
}
