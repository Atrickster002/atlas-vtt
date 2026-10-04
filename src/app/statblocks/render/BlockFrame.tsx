import React from 'react';
import { cn } from '../../../utils/cn';
import { blockSpec, rowSizeOf } from '../model/blockCatalogue';
import { boundField } from '../model/treeQueries';
import type { TemplateBlock } from '../model/templateTypes';
import { useBlockChrome } from './blockChrome';
import type { BlockDisplay } from './blockDisplay';

function lookOf(block: TemplateBlock): string | undefined {
  switch (block.type) {
    case 'stat': case 'tags': case 'track': return block.look;
    case 'scores': return block.orientation;
    case 'image': return block.shape;
    default: return undefined;
  }
}

/** Blocks that read as one labelled line; consecutive ones stand close, as one list. */
function readsAsLine(block: TemplateBlock): boolean {
  return (block.type === 'stat' && block.look === 'run-in')
    || block.type === 'pairs'
    || (block.type === 'tags' && block.look === 'comma');
}

interface BlockFrameProps {
  block: TemplateBlock;
  display: BlockDisplay;
  children: React.ReactNode;
}

/**
 * The element every block renders in, with the hooks themes and tests read:
 * `data-type` (the Fantasy Statblocks type it exports to), `data-block` (the
 * Atlas type), `data-prop` (its field), `data-cls` (its class name) and
 * `data-block-id`; also `data-look` (a Stat's or Tags' look, a Scores
 * orientation, an Image shape) and `data-state` while a fallback or a prompt
 * stands in for its values. The template editor's chrome comes in through
 * `BlockChromeContext` and never changes the frame's box.
 */
export function BlockFrame({ block, display, children }: BlockFrameProps): React.JSX.Element {
  const chrome = useBlockChrome();
  const decoration = chrome?.decorate(block, display) ?? null;

  return (
    <div
      className={cn(
        'atlas-sb-item',
        `atlas-sb-item--${rowSizeOf(block)}`,
        readsAsLine(block) && 'atlas-sb-item--line',
        decoration?.className,
      )}
      data-type={blockSpec(block.type).fsType ?? undefined}
      data-block={block.type}
      data-prop={boundField(block) || undefined}
      data-cls={block.className || undefined}
      data-block-id={block.id}
      data-look={lookOf(block)}
      data-state={display.state === 'value' ? undefined : display.state}
      tabIndex={decoration?.tabIndex}
      role={decoration?.role}
      {...decoration?.attributes}
      {...decoration?.handlers}
    >
      {children}
      {decoration?.overlay}
    </div>
  );
}
