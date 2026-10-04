/**
 * Where the pane edits each value: the fields a shown block holds, and the
 * order Tab walks them in (the template's field order, empty fields included,
 * §7.6). Pure: a template and the card's state in, spots out.
 */

import { isExpressionError } from '../../expressions/errors';
import { parsePatternCached } from '../../expressions/patternParse';
import type { PatternNode } from '../../expressions/patternTypes';
import {
  isContainerBlock, type FieldKey, type FieldType, type StatblockTemplate, type TemplateBlock, type TemplateField,
} from '../../model/templateTypes';
import { blockDisplay } from '../../render/blockDisplay';
import type { SheetState } from '../../render/sheetState';

/** Types the pane edits in place; scores, pairs and the rest edit as text. */
const EDITABLE_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'text', 'markdown', 'number', 'rating', 'dice', 'choice', 'list', 'scores', 'entries', 'pairs', 'image', 'spells',
]);

/** One value the pane can edit: a field, in the block whose values show it. */
export interface EditSpot {
  field: TemplateField;
  blockId: string;
}

export interface EditableSpots {
  /** Per shown block, the fields edited in its place, in the order the block names them. */
  byBlock: ReadonlyMap<string, readonly TemplateField[]>;
  /** Every editable field once, in the template's field order, in the first block that shows it. */
  order: readonly EditSpot[];
}

function plainRefs(nodes: readonly PatternNode[], keys: FieldKey[]): void {
  for (const node of nodes) {
    // `stats.1` is one slot of a field, and a formula derives its value: neither is edited from here.
    if (node.kind === 'refs') keys.push(...node.refs.filter((ref) => !ref.includes('.')));
    else if (node.kind === 'optional') plainRefs(node.nodes, keys);
  }
}

/** The fields a pattern writes as they are, in the order it names them. */
export function patternFields(pattern: string | undefined): FieldKey[] {
  if (!pattern) return [];
  const ast = parsePatternCached(pattern);
  const keys: FieldKey[] = [];
  if (!isExpressionError(ast)) plainRefs(ast.nodes, keys);
  return keys;
}

function blockKeys(block: TemplateBlock): FieldKey[] {
  switch (block.type) {
    case 'title': case 'stat': return [block.field, ...patternFields(block.pattern)];
    case 'line': return [...block.fields, ...patternFields(block.pattern)];
    case 'text': return block.field ? [block.field] : [];
    case 'scores': case 'tags': case 'entries': case 'pairs': case 'track': case 'image': case 'spells':
      return [block.field];
    default: return [];
  }
}

/** The template's fields a block edits in its place. */
export function editableFields(block: TemplateBlock, fields: ReadonlyMap<FieldKey, TemplateField>): TemplateField[] {
  const found = [...new Set(blockKeys(block))].map((key) => fields.get(key));
  return found.filter((field): field is TemplateField => field !== undefined && EDITABLE_TYPES.has(field.type));
}

/** The editable spots of the card as it shows now: hidden blocks (a false `showWhen`) offer none. */
export function editableSpots(template: StatblockTemplate, sheet: SheetState): EditableSpots {
  const byBlock = new Map<string, TemplateField[]>();
  const firstBlock = new Map<FieldKey, string>();
  const visit = (blocks: readonly TemplateBlock[]): void => {
    for (const block of blocks) {
      if (!blockDisplay(block, sheet)) continue;
      if (isContainerBlock(block)) {
        visit(block.blocks);
        continue;
      }
      // The token socket edits an Image block's art (token-socket/), never a text input.
      if (block.type === 'image') continue;
      const fields = editableFields(block, sheet.fields);
      if (!fields.length) continue;
      byBlock.set(block.id, fields);
      for (const field of fields) if (!firstBlock.has(field.key)) firstBlock.set(field.key, block.id);
    }
  };
  visit(template.layout.blocks);
  const order = template.fields.flatMap((field): EditSpot[] => {
    const blockId = firstBlock.get(field.key);
    return blockId ? [{ field, blockId }] : [];
  });
  return { byBlock, order };
}

/** The spot `step` places after (1) or before (-1) the field being edited; null past either end. */
export function neighbourSpot(order: readonly EditSpot[], key: FieldKey, step: 1 | -1): EditSpot | null {
  const index = order.findIndex((spot) => spot.field.key === key);
  if (index < 0) return null;
  return order[index + step] ?? null;
}
