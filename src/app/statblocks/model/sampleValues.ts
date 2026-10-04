import { sampleEntryTexts, sampleNumber, samplePairs, sampleText } from './sampleHints';
import type { FieldKey, FieldValue, StatblockTemplate, TemplateField } from './templateTypes';

/**
 * Samples (§6.2): believable for what each field is for (`sampleHints.ts`),
 * never a property's name shown as its value, and never a creature's or a
 * rulebook's own text, so a built-in's preview stays free of either.
 */
const SAMPLE_DICE = '2d6 + 3';
const SAMPLE_HIT_DICE = '4d8 + 4';
const SAMPLE_RATING = '1';
const SAMPLE_PARAGRAPH = 'A few sentences about the creature, its habits and where it is found.';
const SAMPLE_ITEMS = ['Example one', 'Example two'];
const SAMPLE_SPELLS: FieldValue = [
  'The creature casts spells using Wisdom (save DC 12).',
  { 'At will': 'light, mage hand' },
  { '1/day each': 'cure wounds, sleep' },
];
const SAMPLE_GROUPS: FieldValue = [{ 'First group': 'one, two' }, { 'Second group': 'three' }];

function extraSample(type: 'text' | 'number' | 'list' | 'dice', label: string): FieldValue {
  switch (type) {
    case 'number': return /cost|action/i.test(label) ? 1 : 10;
    case 'dice': return SAMPLE_DICE;
    case 'list': return [...SAMPLE_ITEMS];
    case 'text': return /range/i.test(label) ? 'Close' : /kind|type/i.test(label) ? 'Action' : 'Example';
  }
}

function sampleEntries(field: TemplateField): FieldValue {
  const nameKey = field.entry?.nameKey ?? 'name';
  const textKey = field.entry?.textKey ?? 'desc';
  return sampleEntryTexts(field).map(([name, text]) => {
    const entry: Record<string, FieldValue> = { [nameKey]: name };
    for (const extra of field.entry?.extras ?? []) entry[extra.key] = extraSample(extra.type, extra.label);
    entry[textKey] = text;
    return entry;
  });
}

function sampleDice(field: TemplateField): string {
  return /hit dice|\bhd\b|hit_dice/i.test(`${field.key} ${field.label}`) ? SAMPLE_HIT_DICE : SAMPLE_DICE;
}

function sampleChoice(field: TemplateField): FieldValue {
  const options = field.options ?? [];
  if (field.meaning === 'size' && options.includes('Medium')) return 'Medium';
  return options[0] ?? sampleText(field);
}

function sampleMarkdown(field: TemplateField): string {
  return /legendary/i.test(`${field.key} ${field.label}`)
    ? 'The creature can take 2 legendary actions, choosing from the options below.'
    : SAMPLE_PARAGRAPH;
}

/** The value the template editor previews a field with while no statblock is picked. */
export function sampleValueFor(field: TemplateField): FieldValue {
  switch (field.type) {
    case 'number': return sampleNumber(field);
    case 'rating': return SAMPLE_RATING;
    case 'dice': return sampleDice(field);
    case 'text': return sampleText(field);
    case 'markdown': return sampleMarkdown(field);
    case 'choice': return sampleChoice(field);
    case 'list': return [...SAMPLE_ITEMS];
    case 'scores': return (field.slots ?? []).map((_, index) => [14, 12, 13, 10, 11, 8][index % 6] ?? 10);
    case 'entries': return sampleEntries(field);
    case 'pairs': return samplePairs(field);
    // The renderer shows a neutral silhouette for a missing image.
    case 'image': return null;
    case 'spells': return /spell|magic|cast/i.test(`${field.key} ${field.label}`) ? SAMPLE_SPELLS : SAMPLE_GROUPS;
  }
}

/** A sample for every field, overlaid with the template's own `sample`. */
export function sampleRecord(template: StatblockTemplate): Record<FieldKey, FieldValue> {
  const record: Record<FieldKey, FieldValue> = {};
  for (const field of template.fields) record[field.key] = sampleValueFor(field);
  return { ...record, ...template.sample };
}
