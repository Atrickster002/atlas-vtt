import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import type { FoldedBlock } from '../../render/foldRule';
import './folded-chips.scss';

export interface FoldedChipsProps {
  /** The card's folded sections, in reading order (`foldedBlocks`). */
  folded: readonly FoldedBlock[];
  /** A chip was chosen: the section unfolds in its place. */
  onUnfold: (blockId: string) => void;
  /** Last in the row: "Add a section…". */
  children?: React.ReactNode;
}

/**
 * The row under the card (spec §8.2): one chip per section this statblock
 * has nothing in ("+ Spells", "+ Reactions"), so the card shows what the hover
 * card and the DM screen show, and every section is one click away. Both
 * surfaces draw it, so the template editor's card stays the note view's.
 */
export function FoldedChips({ folded, onUnfold, children }: FoldedChipsProps): React.JSX.Element | null {
  if (folded.length === 0 && !children) return null;
  return (
    <div className="atlas-sb-folded" role="group" aria-label="Sections this statblock has nothing in">
      {folded.map((block) => (
        <Button
          key={block.blockId}
          type="button"
          variant="ghost"
          size="sm"
          className="atlas-sb-folded__chip"
          data-block-id-chip={block.blockId}
          onClick={() => onUnfold(block.blockId)}
        >
          <Plus aria-hidden="true" />
          {block.heading}
        </Button>
      ))}
      {children}
    </div>
  );
}
