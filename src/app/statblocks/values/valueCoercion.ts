/**
 * Turns what someone typed into the value a field of its declared type stores.
 * The declared type decides, never the type of the old value. Text that does
 * not fit is never changed: it comes back raw with a problem in plain words,
 * so the pane can keep it as typed and flag it.
 */

import { parseRating } from '../../creatures/creatureValues';
import type { FieldType, FieldValue, TemplateField } from '../model/templateTypes';
import { isDiceNotation, parseDiceNotation } from './diceNotation';
import { isWholeNumberText, parseNumberText } from './numberText';
import { splitListText } from './listText';
import { parsePairText } from './pairValues';
import { quoted } from './valueText';

/** `value: undefined` means the key is cleared. */
export type CoercionResult =
  | { ok: true; value: FieldValue | undefined }
  | { ok: false; raw: string; problem: string };

/** What a choice field accepts; other types ignore it. */
export type CoercionConstraints = Pick<TemplateField, 'options' | 'open'>;

type Coercer = (text: string, input: string, constraints: CoercionConstraints | undefined) => CoercionResult;

const DICE_EXAMPLE = 'like 2d6 + 3';

function kept(value: FieldValue): CoercionResult {
  return { ok: true, value };
}

function refused(raw: string, problem: string): CoercionResult {
  return { ok: false, raw, problem };
}

function coerceNumber(text: string, input: string): CoercionResult {
  const value = parseNumberText(text);
  return value === null ? refused(input, `${quoted(text)} isn't a number.`) : kept(value);
}

function coerceRating(text: string, input: string): CoercionResult {
  if (isWholeNumberText(text)) return coerceNumber(text, input);
  return parseRating(text) === null ? refused(input, `${quoted(text)} isn't a rating, like 3 or 1/4.`) : kept(text);
}

function coerceDice(text: string, input: string): CoercionResult {
  if (isDiceNotation(text)) return kept(text);
  const problem = parseDiceNotation(text) ? `${quoted(text)} rolls no dice, ${DICE_EXAMPLE}.` : `${quoted(text)} isn't dice, ${DICE_EXAMPLE}.`;
  return refused(input, problem);
}

function coerceChoice(text: string, input: string, constraints: CoercionConstraints | undefined): CoercionResult {
  const options = constraints?.options ?? [];
  const wanted = text.toLowerCase();
  const option = options.find((candidate) => candidate.trim().toLowerCase() === wanted);
  if (option !== undefined) return kept(option);
  if (constraints?.open || options.length === 0) return kept(text);
  return refused(input, `${quoted(text)} isn't one of ${options.join(', ')}.`);
}

/**
 * A table's values in slot order: numbers where they read as numbers, text as
 * typed. Values are parted at commas, semicolons and line breaks, and numbers
 * also at spaces ("14 12 13"), so a text value may hold spaces ("1 per day, d8").
 */
function coerceScores(text: string): CoercionResult {
  const values = text.split(/[,;\n]/).flatMap((part): FieldValue[] => {
    const words = part.trim().split(/\s+/).filter((word) => word !== '');
    const numbers = words.map(parseNumberText);
    if (numbers.every((value) => value !== null)) return numbers.filter((value): value is number => value !== null);
    return [part.trim()];
  });
  return kept(values);
}

function coercePairs(text: string, input: string): CoercionResult {
  const pairs: FieldValue[] = [];
  for (const part of splitListText(text)) {
    const pair = parsePairText(part);
    if (!pair) return refused(input, `${quoted(part)} isn't a name and a number, like Dex +5.`);
    pairs.push({ [pair.key]: pair.value });
  }
  return kept(pairs);
}

const COERCERS: Readonly<Record<FieldType, Coercer>> = {
  text: (text) => kept(text),
  markdown: (_text, input) => kept(input.trimEnd()),
  number: coerceNumber,
  rating: coerceRating,
  dice: coerceDice,
  choice: coerceChoice,
  list: (text) => kept(splitListText(text)),
  scores: coerceScores,
  entries: (_text, input) => refused(input, 'Entries are added one at a time.'),
  pairs: coercePairs,
  image: (text) => kept(text),
  spells: (text) => kept(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')),
};

/**
 * The value `input` stores in a field of `type`. Blank input clears the key.
 * `constraints` are the field's choice options.
 */
export function coerce(type: FieldType, input: string, constraints?: CoercionConstraints): CoercionResult {
  const text = input.trim();
  if (text === '') return { ok: true, value: undefined };
  // A type from a newer template is not in the table; its text is kept as typed.
  const coercer = Object.hasOwn(COERCERS, type) ? COERCERS[type] : COERCERS.text;
  return coercer(text, input, constraints);
}
