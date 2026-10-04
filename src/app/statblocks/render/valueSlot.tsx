import React, { createContext, useContext } from 'react';
import type { FieldValue, TemplateBlock } from '../model/templateTypes';
import { useSheet } from './sheetContext';
import { blockMisfits } from './values/blockMisfits';
import { MisfitChip } from './values/MisfitChip';

/**
 * How the statblock pane edits values in place (§7.6). Each block view puts
 * its values (not its label or heading) in a `ValueSlot`; while the pane edits
 * one of the block's fields, its input stands there instead, in the values'
 * own typographic spot, so the card around it does not move.
 */
export interface ValueEditing {
  /** What shows where `block`'s values show: `values` themselves, or the pane's input in their place or beside them. */
  slot(block: TemplateBlock, values: React.ReactNode): React.ReactNode;
  /**
   * What shows where one ability of a list shows: `line` itself, or the
   * pane's editor of that one ability in its place (§6.3), so the rest of the
   * list stays drawn while one is typed.
   */
  entry?(block: TemplateBlock, entry: EntrySlotInfo, line: React.ReactNode): React.ReactNode;
}

/** One ability as its list draws it: the stored item, its identity, its place in the stored list and among those drawn. */
export interface EntrySlotInfo {
  item: FieldValue;
  key: string;
  index: number;
  shown: number;
}

export const ValueEditingContext = createContext<ValueEditing | null>(null);

interface ValueSlotProps {
  block: TemplateBlock;
  children: React.ReactNode;
}

/**
 * A block's values, each one that does not fit its field's type followed by a
 * chip saying so (§8.8). The runtime card has no editing context: the values
 * render exactly as they are.
 */
export function ValueSlot({ block, children }: ValueSlotProps): React.ReactNode {
  const editing = useContext(ValueEditingContext);
  const { state } = useSheet();
  const misfits = blockMisfits(block, state);
  const values = misfits.length === 0 ? children : (
    <>
      {children}
      {misfits.map((misfit) => <MisfitChip key={misfit.key} misfit={misfit} />)}
    </>
  );
  return editing ? editing.slot(block, values) : values;
}
