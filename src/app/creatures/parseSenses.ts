/**
 * Reads the senses line of a statblock as the senses of a collection, in any of the grammars
 * statblocks use:
 * - D&D 5e: "darkvision 60 ft., blindsight 30 ft. (blind beyond this radius), passive Perception 12",
 *   and the 2024 layout "Blindsight 60 ft., Darkvision 120 ft.; Passive Perception 21".
 * - Pathfinder 2e: "Perception +7; darkvision, scent (imprecise) 30 feet"; a sense without a
 *   distance takes none.
 * - Old-School Essentials: "infravision 60'".
 *
 * What a bracket says about a sense ("rat form only", "imprecise") is not read: the collection's
 * definition decides how the sense behaves.
 */

import { readDistance, toGameUnits, type GameUnit } from '../grid/statedDistance';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';
import { plainText } from './creatureValues';
import { senseNamed } from './senseNames';

export interface ParsedSenses {
  /** The senses the line names, each once, in the order written. */
  senses: TokenSense[];
  /**
   * The creature has no normal sight: it is blind beyond its senses ("blind beyond this radius",
   * "no vision"). Sight should end the token's normal sight at `blindBeyondRange`.
   */
  blindBeyond?: boolean;
  /** Game units beyond which it is blind; unset when the line gives no radius (no normal sight at all). */
  blindBeyondRange?: number;
  /** Phrases that name no sense of the collection, as written ("passive Perception 12"). */
  unknown: string[];
}

const BLIND_BEYOND = /\bblind beyond\b/i;
const NO_VISION = /^no (?:vision|sight)$/i;
/** What a statblock writes where a creature has no senses to list. */
const PLACEHOLDER = /^(?:[-–—]+|none|n\/a)\.?$/i;

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

/** The phrases of a senses line: separated by commas and semicolons outside brackets and numbers ("1,000 feet"). */
function phrasesOf(text: string): string[] {
  const phrases: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (depth > 0 || (char !== ';' && char !== ',')) continue;
    if (char === ',' && isDigit(text[i - 1]) && isDigit(text[i + 1])) continue;
    phrases.push(text.slice(start, i));
    start = i + 1;
  }
  phrases.push(text.slice(start));
  return phrases.map((phrase) => phrase.trim()).filter((phrase) => phrase !== '' && !PLACEHOLDER.test(phrase));
}

interface Phrase {
  /** The name of what it is about: its text without brackets and without the distance. */
  name: string;
  /** Game units; undefined when it states no distance. */
  range: number | undefined;
  blindBeyond: boolean;
}

function readPhrase(phrase: string, unit: GameUnit): Phrase {
  const outside = phrase.replace(/\([^()]*\)/g, ' ');
  // A distance beside the name counts before one in brackets: "30 ft. (10 ft. while deafened)".
  const beside = readDistance(outside);
  const distance = beside ?? readDistance(phrase);
  const before = beside ? outside.slice(0, beside.start) : outside;
  // "60 ft. darkvision": the name follows the distance.
  const name = beside && !/\p{L}/u.test(before) ? outside.slice(beside.end) : before;
  return {
    name,
    range: distance ? toGameUnits(distance, unit) : undefined,
    blindBeyond: BLIND_BEYOND.test(phrase),
  };
}

/** The sense as a token lists it: with the distance stated, which a modifier (`grants`) never takes. */
function senseOf(definition: SenseDefinition, range: number | undefined): TokenSense {
  return range === undefined || definition.grants ? { id: definition.id } : { id: definition.id, range };
}

/** The usual reach of a sense whose phrase states none, where its definition names one. */
function reachOf(definition: SenseDefinition | undefined, range: number | undefined): number | undefined {
  return range ?? (definition?.range === 'required' ? definition.defaultRange : undefined);
}

/**
 * The senses `text` names among `definitions` (the collection's, as `collectionSenses` gives
 * them), with their distances in the collection's game units (`unit`).
 */
export function parseSenses(text: string, definitions: readonly SenseDefinition[], unit: GameUnit): ParsedSenses {
  const senses = new Map<string, TokenSense>();
  const unknown: string[] = [];
  let blindBeyond = false;
  let blindBeyondRange: number | undefined;

  for (const phrase of phrasesOf(plainText(text))) {
    if (NO_VISION.test(phrase)) {
      blindBeyond = true;
      continue;
    }
    const { name, range, blindBeyond: blind } = readPhrase(phrase, unit);
    const definition = senseNamed(name, definitions);
    if (!definition) unknown.push(phrase);
    else if (!senses.has(definition.id)) senses.set(definition.id, senseOf(definition, range));
    if (blind) {
      blindBeyond = true;
      const reach = reachOf(definition, range);
      if (reach !== undefined) blindBeyondRange = Math.max(blindBeyondRange ?? 0, reach);
    }
  }

  return {
    senses: [...senses.values()],
    ...(blindBeyond && { blindBeyond }),
    ...(blindBeyondRange !== undefined && { blindBeyondRange }),
    unknown,
  };
}
