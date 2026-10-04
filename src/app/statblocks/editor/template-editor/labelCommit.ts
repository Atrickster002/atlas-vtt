/**
 * Committing a label typed in the canvas (§7.6), as a pure edit of the
 * template. The first label of a block without a field gives it one: a field
 * of the template or a key the collection's notes use when the label names
 * it, else a new field whose key is derived from the label (`labelToKey`).
 */

import { addField, updateField } from '../../model/fieldOps';
import { bindsFieldType } from '../../model/blockCatalogue';
import { fieldByKey, fieldKeysOf, labelToKey } from '../../model/fieldKeys';
import { spliced, withChildren } from '../../model/treeEdit';
import { updateBlock } from '../../model/treeOps';
import { findBlock } from '../../model/treeQueries';
import { wordsStandAlone, type FieldKey, type FieldType, type StatblockTemplate, type TemplateBlock } from '../../model/templateTypes';
import { labelTargetOf } from './labelTargets';

/** The type a new field gets from the block that names it; the inspector changes it. */
const NEW_FIELD_TYPES: Partial<Record<TemplateBlock['type'], FieldType>> = {
  stat: 'text', line: 'text', title: 'text', tags: 'list', pairs: 'pairs', track: 'number',
  scores: 'scores', entries: 'entries', spells: 'spells', text: 'markdown', image: 'image',
};

export interface LabelCommit {
  template: StatblockTemplate;
  /** The field a block without one was bound to. */
  bound?: { key: FieldKey; created: boolean; fromCollection: boolean } | undefined;
}

function replaceBlock(template: StatblockTemplate, id: string, next: TemplateBlock): StatblockTemplate {
  const found = findBlock(template.layout.blocks, id);
  if (!found) return template;
  const layout = withChildren(template.layout, found.parentId, (children) => spliced(children, found.index, 1, next));
  return layout === template.layout ? template : { ...template, layout };
}

/** The block showing `key`, with the label it was given where the block keeps one. */
function bindBlock(block: TemplateBlock, key: FieldKey, label: string, ownLabel: boolean): TemplateBlock {
  switch (block.type) {
    case 'line': return { ...block, fields: [key] };
    case 'entries': case 'spells': case 'text': return { ...block, field: key, heading: label };
    case 'stat': case 'tags': case 'pairs': case 'track':
      return ownLabel ? { ...block, field: key, label } : { ...block, field: key };
    case 'title': case 'scores': case 'image': return { ...block, field: key };
    default: return block;
  }
}

/** The collection's own spelling of a key, matched without regard to case. */
function collectionKey(keys: Iterable<FieldKey>, wanted: FieldKey): FieldKey | null {
  const lower = wanted.toLowerCase();
  for (const key of keys) if (key.toLowerCase() === lower) return key;
  return null;
}

function bindNewField(template: StatblockTemplate, block: TemplateBlock, label: string, collectionKeys: Iterable<FieldKey>): LabelCommit {
  const type = NEW_FIELD_TYPES[block.type];
  if (!type) return { template };
  const wanted = labelToKey(label, []);
  const existing = fieldByKey(template.fields, wanted);
  if (existing && bindsFieldType(block.type, existing.type)) {
    const next = replaceBlock(template, block.id, bindBlock(block, existing.key, label, existing.label !== label));
    return { template: next, bound: { key: existing.key, created: false, fromCollection: false } };
  }
  const known = [...collectionKeys];
  const used = existing ? null : collectionKey(known, wanted);
  const key = used ?? labelToKey(label, [...fieldKeysOf(template.fields), ...known]);
  const withField = addField(template, { key, label, type });
  if (withField === template) return { template };
  const next = replaceBlock(withField, block.id, bindBlock(block, key, label, false));
  return { template: next, bound: { key, created: true, fromCollection: used !== null } };
}

/** A bound block's label: its own where it keeps one (words standing on their own show only their own), else its field's. */
function relabel(template: StatblockTemplate, block: TemplateBlock, label: string): StatblockTemplate {
  if (block.type !== 'stat' && block.type !== 'tags' && block.type !== 'pairs' && block.type !== 'track') return template;
  const field = fieldByKey(template.fields, block.field);
  const ownLabel = block.label !== undefined || wordsStandAlone(block);
  if (field && !ownLabel) return updateField(template, field.key, { label });
  return block.label === label ? template : replaceBlock(template, block.id, { ...block, label });
}

function reheading(template: StatblockTemplate, block: TemplateBlock, heading: string): StatblockTemplate {
  if (block.type !== 'section' && block.type !== 'entries' && block.type !== 'spells' && block.type !== 'text') return template;
  const edit = updateBlock(template.layout, block.id, block.type, { heading: heading || undefined });
  return edit.ok && edit.layout !== template.layout ? { ...template, layout: edit.layout } : template;
}

/**
 * The template with the label of block `id` set to `text`. An empty label
 * keeps the old one, except a heading, which an empty one removes. Returns
 * the very template where nothing changes, so no undo step is made.
 */
export function commitLabel(
  template: StatblockTemplate, id: string, text: string, collectionKeys: Iterable<FieldKey> = [],
): LabelCommit {
  const block = findBlock(template.layout.blocks, id)?.block;
  const target = block ? labelTargetOf(block, template.fields) : null;
  if (!block || !target) return { template };
  const label = text.trim();
  switch (target.kind) {
    case 'new-field': return label ? bindNewField(template, block, label, collectionKeys) : { template };
    case 'label': return { template: label ? relabel(template, block, label) : template };
    case 'heading': return { template: reheading(template, block, label) };
    case 'text':
      return { template: label && block.type === 'heading' && block.text !== label ? replaceBlock(template, id, { ...block, text: label }) : template };
  }
}
