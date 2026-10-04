/**
 * Lookup tables (spec §10.6): `template.lookups`, read by patterns with
 * `{cr|lookup:xp}`, turn one value into another (a rating into XP). Pure
 * edits that return the very template where nothing changes, so the session
 * makes no step; a table's rows keep their order.
 */

import type { StatblockTemplate } from './templateTypes';

export type LookupRow = readonly [from: string, to: string];

const NAME = /^[a-z][a-z0-9_]*$/;

/** A table name a pattern can name: lower case, digits and `_`, starting with a letter. */
export function tableNameOf(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/, '');
}

/** Why `name` cannot name a new table, or null. */
export function tableNameProblem(template: StatblockTemplate, name: string, renaming?: string): string | null {
  if (!NAME.test(name)) return 'Use letters, digits and _, starting with a letter.';
  if (name !== renaming && template.lookups && Object.hasOwn(template.lookups, name)) return 'Another table has that name.';
  return null;
}

function withLookups(template: StatblockTemplate, lookups: Record<string, Record<string, string>>): StatblockTemplate {
  if (Object.keys(lookups).length > 0) return { ...template, lookups };
  const next = { ...template };
  delete next.lookups;
  return next;
}

/** The template with a new, empty table; a free name ("table", "table_2") where `name` is taken. */
export function addTable(template: StatblockTemplate, name = 'table'): { template: StatblockTemplate; name: string } {
  const base = tableNameOf(name) || 'table';
  let free = base;
  for (let n = 2; template.lookups && Object.hasOwn(template.lookups, free); n++) free = `${base}_${n}`;
  return { template: withLookups(template, { ...template.lookups, [free]: {} }), name: free };
}

export function renameTable(template: StatblockTemplate, from: string, to: string): StatblockTemplate {
  const table = template.lookups?.[from];
  if (!table || from === to || tableNameProblem(template, to, from) !== null) return template;
  const lookups = Object.fromEntries(Object.entries(template.lookups ?? {}).map(([name, rows]) => [name === from ? to : name, rows]));
  return withLookups(template, lookups);
}

export function deleteTable(template: StatblockTemplate, name: string): StatblockTemplate {
  if (!template.lookups || !Object.hasOwn(template.lookups, name)) return template;
  return withLookups(template, Object.fromEntries(Object.entries(template.lookups).filter(([key]) => key !== name)));
}

/** A table's rows in order. */
export function tableRows(template: StatblockTemplate, name: string): LookupRow[] {
  return Object.entries(template.lookups?.[name] ?? {});
}

/** The template with the table holding exactly `rows`; rows without a "from" are dropped, a repeated one keeps its last "to". */
export function setTableRows(template: StatblockTemplate, name: string, rows: readonly LookupRow[]): StatblockTemplate {
  if (!template.lookups || !Object.hasOwn(template.lookups, name)) return template;
  const table: Record<string, string> = {};
  for (const [from, to] of rows) {
    const key = from.trim();
    if (key) table[key] = to;
  }
  const before = template.lookups[name] ?? {};
  if (JSON.stringify(Object.entries(before)) === JSON.stringify(Object.entries(table))) return template;
  return withLookups(template, { ...template.lookups, [name]: table });
}

/**
 * Rows pasted from a spreadsheet or typed as text: one per line, the two
 * columns split by a tab, else by the first comma or semicolon. A line with
 * one column keeps it as "from" with an empty "to".
 */
export function rowsFromPaste(text: string): LookupRow[] {
  return text.split(/\r?\n/).flatMap((line): LookupRow[] => {
    if (!line.trim()) return [];
    const parts = line.includes('\t') ? line.split('\t') : line.split(/[,;](.*)/s);
    const from = (parts[0] ?? '').trim();
    const to = (parts[1] ?? '').trim();
    return from ? [[from, to]] : [];
  });
}
