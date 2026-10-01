import { hasVisionDefaults } from '../gameSystems/visionDefaults';
import type { TokenVision, TokenVisionDefaults } from '../types/lightingTypes';
import { sensesTextOf } from './creatureSenses';
import { parseSenses } from './parseSenses';
import type { SenseRules } from './tokenSensesResolver';

/** Whether a default gives tokens senses, in `senses` or the old fields. */
function givesSenses(defaults: TokenVisionDefaults): boolean {
  return (defaults.senses?.length ?? 0) > 0 || defaults.darkvision !== undefined || defaults.tremorsense !== undefined;
}

/** Whether the statblock's senses line says something a token would follow. */
function statblockHasSenses(fields: Readonly<Record<string, unknown>>, { definitions, unit }: SenseRules): boolean {
  const text = sensesTextOf(fields);
  if (text === null) return false;
  const parsed = parseSenses(text, definitions, unit);
  return parsed.senses.length > 0 || parsed.blindBeyond === true;
}

/**
 * The vision a token placed from the library starts with: the collection's default (`defaults`),
 * with vision off. A token's own senses win over its statblock's, so stamping default senses
 * would cut every creature off from its statblock: where the linked statblock (`statblock`, its
 * fields) names senses of the collection, the default's senses are left out and the token follows
 * the statblock; its sight range and cone are stamped all the same. Nothing of the statblock is
 * ever stamped, and it never switches vision on.
 */
export function placementVision(
  defaults: TokenVisionDefaults | undefined,
  statblock: Readonly<Record<string, unknown>> | null,
  rules: SenseRules,
): TokenVision | undefined {
  if (!defaults) return undefined;
  if (!statblock || !givesSenses(defaults) || !statblockHasSenses(statblock, rules)) return { enabled: false, ...structuredClone(defaults) };
  const { senses: _senses, darkvision: _darkvision, tremorsense: _tremorsense, ...rest } = defaults;
  return hasVisionDefaults(rest) ? { enabled: false, ...rest } : undefined;
}
