/**
 * What an ability's menu does in the panel (spec §5.5): each row one write to
 * the note by the ability's identity, through the pane, so the note's
 * history takes it and a list changed meanwhile is never written into the
 * wrong ability.
 */

import { fieldByKey } from '../../model/fieldKeys';
import { findBlock, flattenReadingOrder } from '../../model/treeQueries';
import type { EntryShape, FieldValue, StatblockTemplate, TemplateField } from '../../model/templateTypes';
import type { NotePatch } from '../../notes/patchTypes';
import { keyedEntryItems } from '../../values/entryKeys';
import { entryName, entryNameKey, entryText, entryTextKey } from '../../values/entryValues';
import { removedMessage } from './announcements';
import { rollsIn } from './diceRolls';
import { singular } from './entryNoun';
import { entryList, insertEntryPatch, moveEntryPatch, removeEntryPatch } from './entryPatches';
import type { EntryMenuInput } from './paneMenus';
import type { PaneEditController } from './paneEditContext';

export interface EntryTarget {
  blockId: string;
  itemKey: string;
}

/** An ability as the menu acts on it: its list's field and values, its place there and in the card. */
export interface FoundEntry {
  field: TemplateField;
  items: FieldValue[];
  item: FieldValue;
  /** Its place in the stored list. */
  index: number;
  /** Its place among the abilities the card shows. */
  shown: number;
  name: string;
  noun: string;
}

/** The ability a handle or a right-click names; null where the note no longer holds it. */
export function findEntry(template: StatblockTemplate, pane: Pick<PaneEditController, 'read'>, target: EntryTarget): FoundEntry | null {
  const block = findBlock(template.layout.blocks, target.blockId)?.block;
  if (block?.type !== 'entries') return null;
  const field = fieldByKey(template.fields, block.field);
  if (!field) return null;
  const value = pane.read(field).value;
  const keyed = keyedEntryItems(value);
  const shown = keyed.findIndex((entry) => entry.key === target.itemKey);
  const found = keyed[shown];
  if (!found) return null;
  const noun = (singular(field.label) || 'entry').toLowerCase();
  const name = entryName(found.item, field.entry) ?? noun;
  return { field, items: entryList(value), item: found.item, index: found.index, shown, name, noun };
}

function sameShape(a: EntryShape | undefined, b: EntryShape | undefined): boolean {
  return entryNameKey(a) === entryNameKey(b) && entryTextKey(a) === entryTextKey(b);
}

/** The other ability lists of the template an ability may move to: those whose abilities are written the same way. */
function otherLists(template: StatblockTemplate, from: TemplateField): Array<{ label: string; field: TemplateField }> {
  return flattenReadingOrder(template.layout.blocks).flatMap((block) => {
    if (block.type !== 'entries' || block.field === from.key) return [];
    const field = fieldByKey(template.fields, block.field);
    return field && sameShape(field.entry, from.entry) ? [{ label: block.heading?.trim() || field.label, field }] : [];
  });
}

export interface EntryActionInput {
  pane: PaneEditController;
  template: StatblockTemplate;
  target: EntryTarget;
  /** The ability's drawn element, whose dice links its menu rolls. */
  element?: HTMLElement | undefined;
  /** Copies text to the clipboard of the panel's window. */
  copy: (text: string) => void;
  /** Says what happened, with Undo where the note's history can take it back. */
  toast: (text: string) => void;
}

export function entryMenuInput({ pane, template, target, element, copy, toast }: EntryActionInput): EntryMenuInput | null {
  const found = findEntry(template, pane, target);
  if (!found) return null;
  const { field, items, item, index, shown, name, noun } = found;
  const list = pane.read(field).key;
  const write = (patches: ReadonlyArray<NotePatch | null>, said?: string): void => {
    void pane.write(field, patches.filter((patch): patch is NotePatch => patch !== null));
    if (said) pane.announce(said);
  };
  return {
    name,
    noun,
    canMoveUp: index > 0,
    canMoveDown: index < items.length - 1,
    moveTargets: otherLists(template, field).map(({ label, field: to }) => ({
      label,
      run: () => {
        const others = entryList(pane.read(to).value);
        const into = insertEntryPatch(pane.read(to).key, others, others.length ? others.length - 1 : null, item);
        write([removeEntryPatch(list, item), into], `Moved ${name} to ${label}.`);
      },
    })),
    edit: () => pane.start({ blockId: target.blockId, field: field.key, entry: shown }),
    move: (step) => write([moveEntryPatch(list, items, index, step)], `Moved ${name} ${step === -1 ? 'up' : 'down'}.`),
    addBelow: () => pane.start({ blockId: target.blockId, field: field.key, entry: shown, add: true }),
    duplicate: () => write([insertEntryPatch(list, items, index, item)], `Duplicated ${name}.`),
    copyText: () => copy([entryName(item, field.entry), entryText(item, field.entry)].filter(Boolean).join('. ')),
    rolls: element ? rollsIn(element) : [],
    remove: () => {
      write([removeEntryPatch(list, item)], removedMessage(name));
      toast(`Deleted ${name}.`);
    },
  };
}
