// SPDX-License-Identifier: AGPL-3.0-only

/** The parts every built-in template shares: its file header, the name and portrait fields, the header row. */

import {
  TEMPLATE_FORMAT,
  TEMPLATE_VERSION,
  type BuiltInTemplate,
  type BuiltInTemplateId,
  type RowBlock,
  type StatBlock,
  type StatblockTemplate,
  type TemplateBlock,
  type TemplateField,
} from '../model/templateTypes';

type TemplateBody = Omit<StatblockTemplate, 'format' | 'version' | 'id'>;

/** A built-in: its name, its revision, and its template under its own id. */
export function builtIn(id: BuiltInTemplateId, name: string, revision: number, body: TemplateBody): BuiltInTemplate {
  return { id, name, revision, template: { format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id, ...body } };
}

export function nameField(): TemplateField {
  return { key: 'name', label: 'Name', type: 'text' };
}

export function portraitField(): TemplateField {
  return { key: 'image', label: 'Portrait', type: 'image' };
}

/** Size words most systems share; `open`, so a system's own sizes ("1M", "Colossal") fit too. */
export function sizeField(): TemplateField {
  return {
    key: 'size', label: 'Size', type: 'choice', options: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'],
    open: true, meaning: 'size',
  };
}

export interface HeaderIds {
  row: string;
  section: string;
  image: string;
}

/** The top of a statblock: the blocks that name the creature, with its portrait beside them. */
export function headerRow(ids: HeaderIds, blocks: TemplateBlock[]): RowBlock {
  return {
    id: ids.row,
    type: 'row',
    blocks: [
      { id: ids.section, type: 'section', size: 'fill', blocks },
      { id: ids.image, type: 'image', field: 'image', shape: 'token' },
    ],
  };
}

export function runInStat(id: string, field: string): StatBlock {
  return { id, type: 'stat', field, look: 'run-in' };
}

export function stackedStat(id: string, field: string): StatBlock {
  return { id, type: 'stat', field, look: 'stacked' };
}

/** Freezes a built-in and everything in it: built-ins are read-only, and every reader shares one copy. */
export function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) frozen(inner);
  }
  return value;
}
