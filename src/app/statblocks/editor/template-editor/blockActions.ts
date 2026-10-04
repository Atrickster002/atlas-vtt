/**
 * The block toolbar's and the keys' edits (§7.6, §7.7) over a session, each
 * one undo step, each saying what it did in the live region.
 */

import { removedMessage } from '../statblock-pane/announcements';
import { createBlock, type AuthorableBlockType } from '../../model/blockCatalogue';
import { addField } from '../../model/fieldOps';
import { fieldKeysOf, labelToKey } from '../../model/fieldKeys';
import { blockIdSource, type BlockIdSource } from '../../model/templateIds';
import { coreSlotBlocks, deleteBlock } from '../../model/coreSlots';
import { duplicateBlock, insertBlock } from '../../model/treeOps';
import { putSideBySide, unwrap, wrapInSection } from '../../model/treeGrouping';
import { childrenOf, type TreeRefusal, type TreeTarget } from '../../model/treeEdit';
import { collectBlockIds, findBlock } from '../../model/treeQueries';
import { turnInto } from '../../model/turnInto';
import type { StatblockTemplate, TemplateBlock, TemplateField, TemplateLayout } from '../../model/templateTypes';
import { pastedBlocks, type BlockClip } from './blockClipboard';
import { insertTarget } from './blockMoves';
import { blockName, typeName } from './blockNames';
import { focusAfterDelete, inSiblingOrder, primaryOf, type BlockSelection } from './selection';
import { applyEdit, applyTree, chainTree, outcomeOf, readOnlyMessage, refusalMessage, type EditOutcome } from './sessionEdit';
import type { EditorSession } from './sessionTypes';

/** What an insert puts in: its blocks, top to bottom, and the fields they bring. */
export interface InsertParts {
  blocks: TemplateBlock[];
  fields: TemplateField[];
}

type InsertResult = { inserted: string } | { refused: TreeRefusal | null };

/** Where an insert goes: after a block (or at the end), or at a gap the `+` line named. */
export type InsertPlace = { after: string | null } | { at: TreeTarget };

function idSource(template: StatblockTemplate): BlockIdSource {
  return blockIdSource(collectBlockIds(template.layout.blocks));
}

function withFields(template: StatblockTemplate, fields: readonly TemplateField[]): StatblockTemplate {
  return fields.reduce((current, field) => addField(current, field), template);
}

/**
 * Inserts the parts `make` builds for the template as it is now, in one step;
 * the first inserted block is selected. Nothing is inserted where a block may
 * not stand at the place.
 */
export function insertParts(
  session: EditorSession, place: InsertPlace, make: (template: StatblockTemplate, nextId: BlockIdSource) => InsertParts, name?: string,
): EditOutcome & { inserted?: string } {
  const result = applyEdit(session, (template): { template: StatblockTemplate; result: InsertResult } => {
    const parts = make(template, idSource(template));
    const first = parts.blocks[0];
    if (!first) return { template, result: { refused: null } };
    const target = 'at' in place ? place.at : insertTarget(template.layout, place.after, first.type);
    const edit = chainTree(template.layout, parts.blocks.map((block, offset) => (layout: TemplateLayout) =>
      insertBlock(layout, block, { parentId: target.parentId, index: target.index + offset })));
    if (!edit.ok) return { template, result: { refused: edit.reason } };
    return { template: { ...withFields(template, parts.fields), layout: edit.layout }, result: { inserted: first.id } };
  });
  const snapshot = session.getSnapshot();
  if (result === null) return { announce: readOnlyMessage(snapshot) ?? undefined };
  if ('refused' in result) return { announce: result.refused ? refusalMessage(result.refused) ?? undefined : undefined };
  const inserted = findBlock(snapshot.template.layout.blocks, result.inserted);
  const said = name ?? (inserted ? blockName(inserted.block, snapshot.template.fields) : 'a block');
  return { select: [result.inserted], inserted: result.inserted, announce: `Added ${said}.` };
}

/** Fields a new block shows from the start: a Title the name, an Image the art. */
const DEFAULT_FIELDS: Partial<Record<AuthorableBlockType, TemplateField>> = {
  title: { key: 'name', label: 'Name', type: 'text' },
  image: { key: 'image', label: 'Image', type: 'image' },
};

/** A block from the catalogue, unbound until its label is committed (a Title and an Image come bound). */
export function insertCatalogueBlock(session: EditorSession, type: AuthorableBlockType, place: InsertPlace): EditOutcome & { inserted?: string } {
  return insertParts(session, place, (template, nextId) => {
    const field = DEFAULT_FIELDS[type];
    return { blocks: [createBlock(type, nextId)], fields: field && !fieldKeysOf(template.fields).has(field.key) ? [field] : [] };
  });
}

/** A Value showing a new property named `name` (the Add panel when nothing matched what was typed). */
export function insertNamedStat(session: EditorSession, name: string, place: InsertPlace): EditOutcome & { inserted?: string } {
  const label = name.trim();
  if (!label) return {};
  return insertParts(session, place, (template, nextId) => {
    const key = labelToKey(label, fieldKeysOf(template.fields));
    return { blocks: [createBlock('stat', nextId, key)], fields: [{ key, label, type: 'text' }] };
  }, label);
}

/** Pastes copied blocks after the selection, with new ids and the fields the template lacks. */
export function pasteClip(session: EditorSession, clip: BlockClip, after: string | null): EditOutcome & { inserted?: string } {
  return insertParts(session, { after }, (template, nextId) => pastedBlocks(clip, template, nextId));
}

/** Mod+D: a copy of each selected block right after it; the copies are selected. */
export function duplicateSelection(session: EditorSession, selection: BlockSelection): EditOutcome {
  const copies: string[] = [];
  const edit = applyTree(session, (layout) => {
    const nextId = blockIdSource(collectBlockIds(layout.blocks));
    copies.length = 0;
    const ordered = inSiblingOrder(layout, selection).reverse();
    return chainTree(layout, ordered.map((id) => (current: TemplateLayout) => {
      const done = duplicateBlock(current, id, nextId);
      if (done.ok && done.focus) copies.unshift(done.focus);
      return done;
    }));
  });
  const snapshot = session.getSnapshot();
  return outcomeOf(edit, snapshot, () => ({ select: [...copies], announce: copies.length > 1 ? `Duplicated ${copies.length} blocks.` : 'Duplicated.' }));
}

/** Delete: the selection goes but its Name and token art, focus moves to the next sibling, else the parent. */
export function deleteSelection(session: EditorSession, selection: BlockSelection): EditOutcome {
  const before = session.getSnapshot().template;
  const cores = coreSlotBlocks(before.layout);
  const doomed = selection.filter((id) => !cores.has(id));
  if (doomed.length === 0) return { announce: refusalMessage('core-slot') ?? undefined };
  const names = inSiblingOrder(before.layout, doomed)
    .map((id) => findBlock(before.layout.blocks, id)?.block)
    .filter((block): block is TemplateBlock => block !== undefined)
    .map((block) => blockName(block, before.fields));
  const after: { focus: string | null } = { focus: null };
  const edit = applyTree(session, (layout) => {
    after.focus = focusAfterDelete(layout, doomed);
    return chainTree(layout, doomed.map((id) => (current: TemplateLayout) => deleteBlock(current, id)));
  });
  return outcomeOf(edit, session.getSnapshot(), () => {
    const what = names.length === 1 ? names[0] ?? 'the block' : `${names.length} blocks`;
    return { select: after.focus ? [after.focus] : [], announce: removedMessage(what), deleted: what };
  });
}

/** Mod+G: the selected siblings into a new Section. */
export function groupSelection(session: EditorSession, selection: BlockSelection): EditOutcome {
  const edit = applyTree(session, (layout) => wrapInSection(layout, selection, blockIdSource(collectBlockIds(layout.blocks))));
  return outcomeOf(edit, session.getSnapshot(), (done) => ({ select: done.focus ? [done.focus] : undefined, announce: 'Grouped into a section.' }));
}

/** Mod+Alt+R: the selected siblings into a Row; a lone block with the one after it. */
export function putSelectionSideBySide(session: EditorSession, selection: BlockSelection): EditOutcome {
  const edit = applyTree(session, (layout) => {
    const only = selection.length === 1 ? findBlock(layout.blocks, selection[0] ?? '') : null;
    const next = only ? childrenOf(layout, only.parentId)?.[only.index + 1] : undefined;
    const ids = only && next ? [only.block.id, next.id] : selection;
    return putSideBySide(layout, ids, blockIdSource(collectBlockIds(layout.blocks)));
  });
  return outcomeOf(edit, session.getSnapshot(), (done) => ({ select: done.focus ? [done.focus] : undefined, announce: 'Put side by side.' }));
}

/** Mod+Shift+G: a Section or Row gives way to its children. */
export function ungroupSelection(session: EditorSession, selection: BlockSelection): EditOutcome {
  const primary = primaryOf(selection);
  if (primary === null) return {};
  const edit = applyTree(session, (layout) => unwrap(layout, primary));
  return outcomeOf(edit, session.getSnapshot(), (done) => ({ select: done.focus ? [done.focus] : [], announce: 'Ungrouped.' }));
}

/** Turn into… and a primitive's kind: another type, keeping the block's place, id and what it shares with the new type. */
export function turnSelectionInto(session: EditorSession, selection: BlockSelection, type: AuthorableBlockType): EditOutcome {
  const primary = primaryOf(selection);
  if (primary === null) return {};
  const edit = applyTree(session, (layout, template) => turnInto(layout, primary, type, template.fields));
  return outcomeOf(edit, session.getSnapshot(), () => ({ select: [primary], announce: `Turned into ${typeName(type)}.` }));
}
