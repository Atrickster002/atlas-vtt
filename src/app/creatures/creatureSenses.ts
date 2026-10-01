/**
 * The senses of a token with a linked statblock. A token follows its statblock's senses line
 * until it has senses of its own: nothing is copied onto the token, so an edit of the note shows
 * at once, and vision itself is never switched on by a statblock.
 */

import { sameSenses } from '../gameSystems/senseRules';
import type { GameUnit } from '../grid/statedDistance';
import type { TokenVision } from '../types/lightingTypes';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';
import { tokenSenses } from '../vision/tokenSenses';
import type { IndexedCreature } from './CreatureIndex';
import { parseSenses, type ParsedSenses } from './parseSenses';

/** What senses read of a token. */
export interface SensedToken {
  vision?: TokenVision | undefined;
  statblockPath?: string | undefined;
}

/** A linked statblock as `CreatureIndex` holds it; a new record replaces it whenever the note is read again. */
export type SensedCreature = Pick<IndexedCreature, 'fields'>;

const NO_SENSES: ParsedSenses = deepFreeze({ senses: [], unknown: [] });

function deepFreeze(parsed: ParsedSenses): ParsedSenses {
  parsed.senses.forEach((sense) => Object.freeze(sense));
  Object.freeze(parsed.senses);
  Object.freeze(parsed.unknown);
  return Object.freeze(parsed);
}

function words(key: string): string {
  return key.replace(/_/g, ' ');
}

/** One entry of a senses list as a phrase: text, a named entry (`name`, `desc`), or nothing. */
function phraseOf(entry: unknown): string | null {
  if (typeof entry === 'string') return entry.trim() || null;
  if (typeof entry !== 'object' || entry === null) return null;
  const { name, desc } = entry as { name?: unknown; desc?: unknown };
  const parts = [name, desc].filter((part): part is string | number => (typeof part === 'string' && part.trim() !== '') || typeof part === 'number');
  return parts.length > 0 ? parts.join(' ') : null;
}

/** Senses kept by name (`{ darkvision: "120 ft.", passive_perception: 20 }`) as a line. */
function namedSenses(senses: Record<string, unknown>): string[] {
  return Object.entries(senses).flatMap(([key, value]) => {
    if (value === true) return [words(key)];
    if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) return [`${words(key)} ${value}`];
    return [];
  });
}

/** The senses of a Pathfinder perception line, which follow its modifier: "+7; darkvision". */
function afterModifier(perception: unknown): string | null {
  const entries: unknown[] = Array.isArray(perception) ? perception : [perception];
  const senses = entries.flatMap((entry) => {
    const line = typeof entry === 'object' && entry !== null ? (entry as { desc?: unknown }).desc : entry;
    const modifierEnd = typeof line === 'string' ? line.indexOf(';') : -1;
    const after = typeof line === 'string' && modifierEnd >= 0 ? line.slice(modifierEnd + 1).trim() : '';
    return after ? [after] : [];
  });
  return senses.length > 0 ? senses.join(', ') : null;
}

/**
 * The senses line of a statblock in any shape Fantasy Statblocks holds it: the `senses` text of
 * its Basic 5e and Pathfinder 2e Creature layouts (from frontmatter, a fence or the bestiary), a
 * list of such texts or of named entries, senses kept by name, or, without `senses`, what follows
 * the modifier in the `perception` trait of its Basic Pathfinder 2e layout. Null without one.
 */
export function sensesTextOf(fields: Readonly<Record<string, unknown>>): string | null {
  const { senses } = fields;
  let phrases: string[] = [];
  if (typeof senses === 'string') phrases = senses.trim() ? [senses.trim()] : [];
  else if (Array.isArray(senses)) phrases = senses.flatMap((entry) => phraseOf(entry) ?? []);
  else if (typeof senses === 'object' && senses !== null) phrases = namedSenses(senses as Record<string, unknown>);
  return phrases.length > 0 ? phrases.join(', ') : afterModifier(fields.perception);
}

interface CachedSenses {
  definitions: readonly SenseDefinition[];
  unit: GameUnit;
  parsed: ParsedSenses;
}

/** The last reading of each creature record; a record the index replaced takes its reading with it. */
const readings = new WeakMap<SensedCreature, CachedSenses>();

function sameRules(cached: CachedSenses, definitions: readonly SenseDefinition[], unit: GameUnit): boolean {
  return cached.unit.unitType === unit.unitType
    && cached.unit.unitDistance === unit.unitDistance
    && (cached.definitions === definitions || sameSenses(cached.definitions, definitions));
}

/**
 * What a creature's statblock says about its senses, read with the collection's senses and unit.
 * Read once per creature record: `CreatureIndex` hands out a new record whenever the note or the
 * bestiary changes, and a change of the collection's senses or unit reads it again. The result
 * is shared and frozen.
 */
export function creatureSenses(creature: SensedCreature | null | undefined, definitions: readonly SenseDefinition[], unit: GameUnit): ParsedSenses {
  if (!creature) return NO_SENSES;
  const cached = readings.get(creature);
  if (cached && sameRules(cached, definitions, unit)) return cached.parsed;
  const text = sensesTextOf(creature.fields);
  const parsed = text === null ? NO_SENSES : deepFreeze(parseSenses(text, definitions, unit));
  readings.set(creature, { definitions, unit: { unitType: unit.unitType, unitDistance: unit.unitDistance }, parsed });
  return parsed;
}

/** Whether the statblock says anything sight acts on. */
function saysSomething(parsed: ParsedSenses): boolean {
  return parsed.senses.length > 0 || parsed.blindBeyond === true;
}

/**
 * The senses a token has of its own, as `tokenSenses` reads them: its `vision.senses` once that
 * is a list (even an empty one), else its old darkvision and tremorsense fields. Null when it has
 * neither, so it follows its statblock.
 */
export function ownSenses(token: SensedToken, definitions: readonly SenseDefinition[]): TokenSense[] | null {
  const own = tokenSenses(token.vision, definitions);
  return Array.isArray(token.vision?.senses) || own.length > 0 ? own : null;
}

/** How a token perceives beyond normal sight, and where that comes from. */
export interface EffectiveVision {
  senses: TokenSense[];
  /** `token`: its own senses or old fields. `statblock`: it follows its linked statblock. */
  source: 'token' | 'statblock' | 'none';
  /**
   * The statblock says the creature is blind beyond its senses. Sight should cap the token's
   * normal sight at `blindBeyondRange` game units, or give it none where that is unset. Only
   * ever true while the senses follow the statblock.
   */
  blindBeyond: boolean;
  blindBeyondRange?: number;
}

/**
 * A token's senses and what its statblock says about its sight, in this order: the token's own
 * `vision.senses` (even empty), else its old darkvision and tremorsense fields, else the senses
 * of its linked statblock. `creature` is the record of `token.statblockPath` in `CreatureIndex`
 * (undefined while unread, null without a statblock).
 */
export function effectiveVision(
  token: SensedToken,
  creature: SensedCreature | null | undefined,
  definitions: readonly SenseDefinition[],
  unit: GameUnit,
): EffectiveVision {
  const own = ownSenses(token, definitions);
  if (own) return { senses: own, source: 'token', blindBeyond: false };
  const parsed = token.statblockPath ? creatureSenses(creature, definitions, unit) : NO_SENSES;
  if (!saysSomething(parsed)) return { senses: NO_SENSES.senses, source: 'none', blindBeyond: false };
  return {
    senses: parsed.senses,
    source: 'statblock',
    blindBeyond: parsed.blindBeyond === true,
    ...(parsed.blindBeyondRange !== undefined && { blindBeyondRange: parsed.blindBeyondRange }),
  };
}

/** The senses of `effectiveVision`. The list is shared between calls and frozen: compare it by reference, never change it. */
export function effectiveSenses(
  token: SensedToken,
  creature: SensedCreature | null | undefined,
  definitions: readonly SenseDefinition[],
  unit: GameUnit,
): TokenSense[] {
  return effectiveVision(token, creature, definitions, unit).senses;
}

/** What a token takes from its statblock, for an editor to show. */
export interface InheritedSenses {
  senses: TokenSense[];
  /** Phrases of the senses line that name no sense of the collection, without its perception scores. */
  notRecognised: string[];
  blindBeyond: boolean;
  blindBeyondRange?: number;
}

/** "passive Perception 12", "Perception +7": part of the senses line, never a sense. */
const PERCEPTION_SCORE = /^(?:passive\s+)?perception\b/i;

/**
 * The senses a token follows from its statblock, or null when it has senses of its own, links no
 * statblock, or the statblock's senses line says nothing to show. The lists are the caller's.
 */
export function inheritedSensesOf(
  token: SensedToken,
  creature: SensedCreature | null | undefined,
  definitions: readonly SenseDefinition[],
  unit: GameUnit,
): InheritedSenses | null {
  if (!token.statblockPath || ownSenses(token, definitions)) return null;
  const parsed = creatureSenses(creature, definitions, unit);
  const notRecognised = parsed.unknown.filter((phrase) => !PERCEPTION_SCORE.test(phrase));
  if (!saysSomething(parsed) && notRecognised.length === 0) return null;
  return {
    senses: parsed.senses.map((sense) => ({ ...sense })),
    notRecognised,
    blindBeyond: parsed.blindBeyond === true,
    ...(parsed.blindBeyondRange !== undefined && { blindBeyondRange: parsed.blindBeyondRange }),
  };
}
