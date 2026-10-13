/**
 * The statblock fields the initiative settings offer as chips for the modifier: what the
 * collection's role templates mean as initiative first, then their other numbers and the slots
 * of their scores (an ability score, read with the switch), then the further fields its
 * statblocks hold that read as a number.
 */

import { discoverFields } from '../resources/resourceFields';
import type { FieldSuggestion } from '../resources/resourceFieldSuggestions';
import type { StatblockTemplate, TemplateField } from '../statblocks/model/templateTypes';
import { parseInitiativeModifier } from './initiativeModifier';

const suggestionOf = (field: TemplateField): FieldSuggestion => ({ path: field.key, label: field.label });

export function initiativeFieldSuggestions(
  templates: readonly StatblockTemplate[],
  records: readonly Readonly<Record<string, unknown>>[],
): FieldSuggestion[] {
  const fields = templates.flatMap((template) => template.fields);
  const offered = new Map<string, FieldSuggestion>();
  const offer = (suggestion: FieldSuggestion): void => {
    if (!offered.has(suggestion.path)) offered.set(suggestion.path, suggestion);
  };
  fields.filter((field) => field.meaning === 'initiative').map(suggestionOf).forEach(offer);
  fields.filter((field) => field.type === 'number').map(suggestionOf).forEach(offer);
  for (const field of fields) {
    if (field.type === 'scores') (field.slots ?? []).forEach((slot, index) => offer({ path: `${field.key}.${index}`, label: slot }));
  }
  discoverFields(records, (value) => parseInitiativeModifier(value) !== null).forEach((path) => offer({ path }));
  return [...offered.values()];
}
