/**
 * The Fields tab's sample values (§7.9) as one line of text each: what the
 * input shows for a field's sample, what a typed line stores in `sample`, and
 * the pure edit that stores it. A sample equal to the neutral default is not
 * stored, so clearing a change and typing the default back are the same.
 */

import { sampleValueFor } from '../../model/sampleValues';
import type { FieldKey, FieldValue, StatblockTemplate, TemplateField } from '../../model/templateTypes';

const NUMBER = /^[+-]?\d+(?:\.\d+)?$/;
const LIST_SEPARATOR = /\s*,\s*/;

/** Whether a sample of this field can be typed as one line; an image's never is (the canvas shows a silhouette). */
export function sampleIsTyped(field: TemplateField): boolean {
  return field.type !== 'image';
}

function scalarText(value: FieldValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function pairsOf(value: FieldValue | undefined): Array<[string, FieldValue]> {
  if (Array.isArray(value)) return value.flatMap((item) => pairsOf(item));
  if (value && typeof value === 'object') return Object.entries(value);
  return [];
}

function entryNames(field: TemplateField, value: FieldValue | undefined): string[] {
  const nameKey = field.entry?.nameKey ?? 'name';
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (entry && typeof entry === 'object' && !Array.isArray(entry) ? scalarText(entry[nameKey]) : scalarText(entry)));
}

/** The line the Fields tab shows for a sample value. */
export function sampleToText(field: TemplateField, value: FieldValue | undefined): string {
  switch (field.type) {
    case 'list': case 'spells': case 'scores':
      return Array.isArray(value) ? value.map(scalarText).filter(Boolean).join(', ') : scalarText(value);
    case 'pairs': return pairsOf(value).map(([key, item]) => `${key} ${scalarText(item)}`.trim()).join(', ');
    case 'entries': return entryNames(field, value).join(', ');
    default: return scalarText(value);
  }
}

/** "14" → 14, "+3" → 3; anything else as typed. */
function numberOrText(text: string): FieldValue {
  return NUMBER.test(text) ? Number(text) : text;
}

function items(text: string): string[] {
  return text.split(LIST_SEPARATOR).map((item) => item.trim()).filter(Boolean);
}

/** "dex 5, con: +3" → { dex: 5, con: 3 }; a part without a value counts 0. */
function pairsFromText(text: string): FieldValue {
  const pairs: Record<string, FieldValue> = {};
  for (const part of items(text)) {
    const match = /^(.*?)[\s:]+([^\s:]+)$/.exec(part);
    const key = (match?.[1] ?? part).trim();
    if (key) pairs[key] = match?.[2] ? numberOrText(match[2]) : 0;
  }
  return pairs;
}

/** Entries named as typed; each keeps the text and extras the sample had at its place, else the default's. */
function entriesFromText(field: TemplateField, text: string, current: FieldValue | undefined): FieldValue {
  const nameKey = field.entry?.nameKey ?? 'name';
  const defaults = sampleValueFor(field);
  const model = Array.isArray(defaults) ? defaults[0] : undefined;
  return items(text).map((name, index): FieldValue => {
    const before = Array.isArray(current) ? current[index] : undefined;
    const base = before && typeof before === 'object' && !Array.isArray(before) ? before
      : model && typeof model === 'object' && !Array.isArray(model) ? model : {};
    return { ...base, [nameKey]: name };
  });
}

/** What a typed line stores: numbers where the field holds numbers, lists split at commas. */
export function textToSample(field: TemplateField, text: string, current?: FieldValue): FieldValue {
  const trimmed = text.trim();
  switch (field.type) {
    case 'number': return trimmed === '' ? null : numberOrText(trimmed);
    case 'rating': return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
    case 'list': case 'spells': return items(trimmed);
    case 'scores': return items(trimmed.replace(/\s+/g, ',')).map(numberOrText);
    case 'pairs': return pairsFromText(trimmed);
    case 'entries': return entriesFromText(field, trimmed, current);
    default: return trimmed;
  }
}

function sameValue(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Whether the template stores a sample of its own for the field. */
export function hasOwnSample(template: StatblockTemplate, key: FieldKey): boolean {
  return template.sample !== undefined && Object.hasOwn(template.sample, key);
}

/**
 * The template with `value` as the field's sample; `undefined` (or the
 * default sample) removes the template's own. The very template where
 * nothing changes, so the session makes no undo step.
 */
export function withSample(template: StatblockTemplate, field: TemplateField, value: FieldValue | undefined): StatblockTemplate {
  const own = hasOwnSample(template, field.key);
  const keep = value !== undefined && !sameValue(value, sampleValueFor(field));
  if (keep && own && sameValue(template.sample?.[field.key], value)) return template;
  if (!keep && !own) return template;
  const rest = Object.fromEntries(Object.entries(template.sample ?? {}).filter(([key]) => key !== field.key));
  const sample = keep ? { ...rest, [field.key]: value } : rest;
  if (Object.keys(sample).length > 0) return { ...template, sample };
  const withoutSample = { ...template };
  delete withoutSample.sample;
  return withoutSample;
}
