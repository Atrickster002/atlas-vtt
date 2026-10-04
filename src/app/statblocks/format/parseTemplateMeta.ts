/** Reads what a template says about itself: where it came from, its licence, its lookup tables. */

import type { StatblockTemplate, TemplateLicence, TemplateSource } from '../model/templateTypes';
import { DERIVED_FROM_KEYS, IMPORTED_FROM_KEYS, SOURCE_KEYS } from './formatKeys';
import { describeValue, isRecord } from './jsonValues';
import { ObjectReader } from './objectReader';
import { JSON_OBJECT, asJsonRecord, asKey, asNonNegativeInteger, asOneOf, asString, asText } from './valueReads';

type DerivedFrom = NonNullable<StatblockTemplate['derivedFrom']>;
type ImportedFrom = NonNullable<StatblockTemplate['importedFrom']>;
type Lookups = NonNullable<StatblockTemplate['lookups']>;

const LICENCE_SET: Record<TemplateLicence, true> = {
  'CC-BY-4.0': true, 'CC-BY-3.0': true, 'CC-BY-SA-4.0': true, ORC: true, 'DS-Creator': true, 'RTG-Homebrew': true,
  'Paizo-CUP': true,
};
const LICENCES = Object.keys(LICENCE_SET).filter((key): key is TemplateLicence => Object.hasOwn(LICENCE_SET, key));

export function readDerivedFrom(raw: unknown, problems: string[]): DerivedFrom | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, 'The template’s origin', problems, DERIVED_FROM_KEYS);
  const templateId = r.get('templateId', asKey);
  if (templateId === undefined) return undefined;
  return r.finish({ templateId, ...r.opt('revision', asNonNegativeInteger, 'a whole number') });
}

/** A licensed built-in's source; undefined unless every required part is text. */
export function readSource(raw: unknown, problems: string[]): TemplateSource | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, 'The template’s source', problems, SOURCE_KEYS);
  const system = r.get('system', asString);
  const label = r.get('label', asString);
  const attribution = r.get('attribution', asString);
  const licenceUrl = r.get('licenceUrl', asString);
  const modification = r.get('modification', asString);
  if (system === undefined || label === undefined || attribution === undefined) return undefined;
  if (licenceUrl === undefined || modification === undefined || !Array.isArray(r.rawValue('licences'))) return undefined;
  return r.finish({
    system,
    label,
    licences: r.requiredList('licences', asOneOf(LICENCES), 'licences this version of Atlas knows'),
    attribution,
    licenceUrl,
    ...r.opt('sourceUrl', asString, 'text'),
    modification,
    ...r.opt('trademarkNotice', asString, 'text'),
  });
}

export function readImportedFrom(raw: unknown, problems: string[]): ImportedFrom | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, 'The template’s Fantasy Statblocks layout', problems, IMPORTED_FROM_KEYS);
  const layoutId = r.get('layoutId', asString);
  const layoutName = r.get('layoutName', asString);
  if (layoutId === undefined || layoutName === undefined) return undefined;
  return r.finish({ layoutId, layoutName, ...r.opt('extras', asJsonRecord, JSON_OBJECT) });
}

/**
 * The lookup tables. Numbers in a table read as text (`"1": 200` is `"200"`);
 * a table that is no object and a row that is no text are left out, and the
 * file's tables are then kept for writing back.
 */
export function readLookups(r: ObjectReader<keyof StatblockTemplate>): Partial<Pick<StatblockTemplate, 'lookups'>> {
  const raw = r.rawValue('lookups');
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    r.keep('lookups', raw, undefined, `is ${describeValue(raw)}, not an object of tables; it is ignored`);
    return {};
  }
  let dropped = 0;
  const tables: [string, Record<string, string>][] = [];
  for (const [name, table] of Object.entries(raw)) {
    if (!isRecord(table)) {
      dropped += 1;
      continue;
    }
    const rows: [string, string][] = [];
    for (const [row, value] of Object.entries(table)) {
      const text = asText(value);
      if (text === undefined) dropped += 1;
      else rows.push([row, text]);
    }
    tables.push([name, Object.fromEntries(rows)]);
  }
  const lookups: Lookups = Object.fromEntries(tables);
  if (dropped > 0) r.keep('lookups', raw, lookups, `holds ${dropped} tables or rows that are not text; they are ignored`);
  return { lookups };
}
