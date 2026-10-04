import type { StatblockTemplate, TemplateBlock } from '../../../model/templateTypes';
import type { EditorSession } from '../sessionTypes';

/** What every inspector group gets: the selected block as the template holds it now. */
export interface GroupProps {
  block: TemplateBlock;
  template: StatblockTemplate;
  session: EditorSession;
  /** A built-in, or a template of a newer Atlas: every control shows, disabled. */
  readOnly: boolean;
  /** The container the block stands in; null at the top level. */
  parent: TemplateBlock | null;
}

/** Blocks with a label of their own beside their values. */
export type LabelledBlock = Extract<TemplateBlock, { type: 'stat' | 'tags' | 'pairs' | 'track' }>;

export function isLabelled(block: TemplateBlock): block is LabelledBlock {
  return block.type === 'stat' || block.type === 'tags' || block.type === 'pairs' || block.type === 'track';
}

/** Blocks whose values may be empty, which hide or show a fallback then; an empty Image shows a silhouette. */
export function canBeEmpty(block: TemplateBlock): boolean {
  return !['section', 'row', 'tabs', 'heading', 'divider', 'image', 'script', 'opaque'].includes(block.type);
}
