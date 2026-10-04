/**
 * The panel's menus (spec §5.5): an ability's and a block's, the same
 * whether opened by the handle, a right-click or Shift+F10. Pure: what each
 * row does comes in as callbacks. Words tell the truth about the data:
 * "Clear … on this statblock" deletes this note's values; "Remove … from
 * <template>" changes the template for every statblock that uses it, and
 * says how many, before the click.
 */

import { shortcutText } from '../template-editor/shortcutText';
import { SEPARATOR, tidy, type SurfaceAction } from '../interaction/surfaceActions';

/** A dice expression of a value or an ability: rolling it is clicking its link. */
export interface RollChoice {
  label: string;
  run: () => void;
}

/** "Roll 3d6 + 5" for one expression, "Roll ▸" with each for several; nothing without dice. */
function rollRows(rolls: readonly RollChoice[]): SurfaceAction[] {
  const [only, ...rest] = rolls;
  if (!only) return [];
  if (rest.length === 0) return [{ kind: 'item', id: 'roll', label: `Roll ${only.label}`, icon: 'dices', run: only.run }];
  return [{
    kind: 'submenu', id: 'roll', label: 'Roll', icon: 'dices',
    children: rolls.map((roll, index) => ({ kind: 'item', id: `roll-${index}`, label: roll.label, run: roll.run })),
  }];
}

export interface EntryMenuInput {
  /** "Tentacle", or the noun where the ability has no name. */
  name: string;
  /** What one ability of the list is called, lower case: "action". */
  noun: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** The other lists the ability may move to, by their headings. */
  moveTargets: ReadonlyArray<{ label: string; run: () => void }>;
  edit: () => void;
  move: (step: 1 | -1) => void;
  addBelow: () => void;
  duplicate: () => void;
  copyText: () => void;
  remove: () => void;
  /** The dice expressions in its text. */
  rolls?: readonly RollChoice[] | undefined;
}

export function paneEntryMenu(input: EntryMenuInput): SurfaceAction[] {
  return tidy([
    { kind: 'item', id: 'edit', label: `Edit ${input.name}`, icon: 'pencil', hint: '⏎', run: input.edit },
    ...rollRows(input.rolls ?? []),
    SEPARATOR,
    { kind: 'item', id: 'move-up', label: 'Move up', icon: 'arrow-up', hint: shortcutText(['Alt'], '↑'), disabled: !input.canMoveUp, run: () => input.move(-1) },
    { kind: 'item', id: 'move-down', label: 'Move down', icon: 'arrow-down', hint: shortcutText(['Alt'], '↓'), disabled: !input.canMoveDown, run: () => input.move(1) },
    {
      kind: 'submenu', id: 'move-to', label: 'Move to', icon: 'corner-down-right',
      children: input.moveTargets.map((target, index) => ({ kind: 'item', id: `move-to-${index}`, label: target.label, run: target.run })),
    },
    SEPARATOR,
    { kind: 'item', id: 'add-below', label: `Add ${input.noun} below`, icon: 'plus', hint: shortcutText(['Mod'], '⏎'), run: input.addBelow },
    { kind: 'item', id: 'duplicate', label: 'Duplicate', icon: 'copy-plus', hint: shortcutText(['Mod'], 'D'), run: input.duplicate },
    { kind: 'item', id: 'copy-text', label: 'Copy as text', icon: 'copy', run: input.copyText },
    SEPARATOR,
    { kind: 'item', id: 'delete', label: `Delete ${input.name}`, icon: 'trash-2', hint: 'Del', destructive: true, run: input.remove },
  ]);
}

export interface BlockMenuInput {
  /** The block's own name: "Spells", "Armor Class". */
  name: string;
  /** Whether it has values the panel edits in place. */
  editable: boolean;
  /** Whether the note holds a value it shows: "Clear" is disabled while it holds none. */
  hasValues: boolean;
  /** Right-clicked on a value: "Copy value" in place of "Copy as text". */
  onValue: boolean;
  edit: () => void;
  copyText: () => void;
  clear: () => void;
  /** Opens the template editor on this block; unset where that is not wired in. */
  editInTemplate?: (() => void) | undefined;
  /** Opens "Add a section…" to add one below this block; unset where the template can't change. */
  addSectionBelow?: (() => void) | undefined;
  /** The dice expressions in its value. */
  rolls?: readonly RollChoice[] | undefined;
  /** The last row's words ("Remove Spells from Hill folk · 3 statblocks") and its action; unset where the template can't change. */
  remove?: { label: string; run: () => void } | undefined;
}

export function paneBlockMenu(input: BlockMenuInput): SurfaceAction[] {
  return tidy([
    ...(input.editable ? [{ kind: 'item', id: 'edit', label: `Edit ${input.name}`, icon: 'pencil', hint: '⏎', run: input.edit } satisfies SurfaceAction] : []),
    ...rollRows(input.rolls ?? []),
    { kind: 'item', id: 'copy-text', label: input.onValue ? 'Copy value' : 'Copy as text', icon: 'copy', run: input.copyText },
    SEPARATOR,
    { kind: 'item', id: 'clear', label: `Clear ${input.name} on this statblock`, icon: 'eraser', disabled: !input.hasValues, run: input.clear },
    ...(input.addSectionBelow ? [{ kind: 'item', id: 'add-section', label: 'Add a section below…', icon: 'plus', run: input.addSectionBelow } satisfies SurfaceAction] : []),
    SEPARATOR,
    ...(input.editInTemplate ? [{ kind: 'item', id: 'edit-in-template', label: 'Edit in template', icon: 'layout-template', run: input.editInTemplate } satisfies SurfaceAction] : []),
    ...(input.remove ? [{ kind: 'item', id: 'remove', label: input.remove.label, icon: 'trash-2', destructive: true, run: input.remove.run } satisfies SurfaceAction] : []),
  ]);
}
