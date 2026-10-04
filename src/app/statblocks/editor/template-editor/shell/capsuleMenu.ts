/** The entries of the template editor capsule's ⋯ menu (§2.3), built from what the capsule can do. */

import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import { noteName } from '../../../../utils/pathUtils';
import type { CollectionContext } from '../../collectionContext';
import { alignedEntries } from '../../interaction/surfaceActions';
import type { ShowAs, ShowAsChoice } from './showAs';

/** The statblocks the menu lists under "Used by"; the count says how many there are. */
const LISTED_NOTES = 50;

/** A dock panel offered in the menu while the view is stacked and the dock has no room. */
export interface MenuDockEntry {
  label: string;
  icon: string;
  open: () => void;
}

export interface CapsuleMenuInput {
  showAs: ShowAs;
  showAsChoices: readonly ShowAsChoice[];
  onShowAs: (choice: ShowAs) => void;
  newStatblock?: (() => void) | undefined;
  makeCopy?: (() => void) | undefined;
  /** "Back to Aboleth": the note this leaf showed before "Edit template" (§8.4). */
  backToNote?: { name: string; go: () => void } | undefined;
  /** Unset where the template cannot be deleted (a built-in). */
  deleteTemplate?: (() => void) | undefined;
  /** The dock's panels, in a stacked view. */
  dock?: readonly MenuDockEntry[] | undefined;
  /** The statblocks that use the template, listed here once the capsule folded its count. */
  usedBy?: { notes: readonly string[]; openNote: (path: string) => void } | undefined;
  /** The collection, chosen here once the capsule folded its chip. */
  collection?: { context: CollectionContext; onChange: (collectionId: string) => void } | undefined;
}

function usedByEntry({ notes, openNote }: NonNullable<CapsuleMenuInput['usedBy']>): ContextMenuEntry {
  const count = notes.length;
  const label = count === 1 ? 'Used by 1 statblock' : `Used by ${count} statblocks`;
  if (count === 0) return { type: 'item', label: 'Not used by any statblock yet', icon: 'scroll-text', disabled: true, onClick: () => undefined };
  return {
    type: 'submenu',
    label,
    icon: 'scroll-text',
    children: notes.slice(0, LISTED_NOTES).map((path) => ({ type: 'item', label: noteName(path), icon: 'scroll-text', onClick: () => openNote(path) })),
  };
}

function collectionEntry({ context, onChange }: NonNullable<CapsuleMenuInput['collection']>): ContextMenuEntry {
  return {
    type: 'submenu',
    label: 'Collection',
    icon: 'library',
    children: context.collections.map((collection) => ({
      type: 'item',
      label: collection.name,
      checked: collection.id === context.collectionId,
      onClick: () => onChange(collection.id),
    })),
  };
}

export function capsuleMenuEntries(input: CapsuleMenuInput): ContextMenuEntry[] {
  return alignedEntries(capsuleRows(input));
}

function capsuleRows(input: CapsuleMenuInput): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = (input.dock ?? []).map((panel) => ({ type: 'item', label: panel.label, icon: panel.icon, onClick: panel.open }));
  entries.push({
    type: 'submenu',
    label: 'Show as',
    icon: 'scan',
    children: input.showAsChoices.map((choice) => ({
      type: 'item',
      label: choice.label,
      checked: choice.value === input.showAs,
      onClick: () => input.onShowAs(choice.value),
    })),
  });
  if (input.newStatblock) entries.push({ type: 'item', label: 'New statblock with this template', icon: 'file-plus', onClick: input.newStatblock });
  if (input.makeCopy) entries.push({ type: 'item', label: 'Make a copy', icon: 'copy', onClick: input.makeCopy });
  if (input.backToNote) entries.push({ type: 'item', label: `Back to ${input.backToNote.name}`, icon: 'arrow-left', onClick: input.backToNote.go });
  if (input.usedBy) entries.push(usedByEntry(input.usedBy));
  if (input.collection?.context.switchable) entries.push(collectionEntry(input.collection));
  entries.push({
    type: 'item',
    label: 'Delete template…',
    icon: 'trash-2',
    destructive: true,
    disabled: !input.deleteTemplate,
    onClick: () => input.deleteTemplate?.(),
  });
  return entries;
}
