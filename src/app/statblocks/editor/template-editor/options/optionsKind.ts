/**
 * Which Options a selected block has: a Value's, an Abilities list's, a Table's, or the header line's values;
 * a Metric's only where they say what players may do with it (`playersRow`); none for the rest. Pure.
 */

import { tileKind } from '../../../model/templateGrid';
import { findBlock } from '../../../model/treeQueries';
import type { StatblockTemplate } from '../../../model/templateTypes';

export type OptionsKind = 'value' | 'abilities' | 'table' | 'line' | 'metric';

export function optionsKindOf(template: StatblockTemplate, blockId: string, playersRow = false): OptionsKind | null {
  const block = findBlock(template.layout.blocks, blockId)?.block;
  if (!block) return null;
  if (block.type === 'line') return 'line';
  const kind = tileKind(block);
  if (kind === 'metric') return playersRow ? kind : null;
  return kind === 'value' || kind === 'abilities' || kind === 'table' ? kind : null;
}
