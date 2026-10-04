import React, { useMemo } from 'react';
import type { App } from 'obsidian';
import { fieldByKey } from '../../model/fieldKeys';
import { findBlock } from '../../model/treeQueries';
import type { StatblockTemplate } from '../../model/templateTypes';
import { BlockChromeContext, type BlockChrome } from '../../render/blockChrome';
import { BlockView } from '../../render/BlockView';
import { SheetContext, type SheetContextValue } from '../../render/sheetContext';
import { sheetState } from '../../render/sheetState';
import type { FieldRecord } from '../../values/fieldValues';
import { FieldFace } from '../template-editor/PropertiesPanel';
import { ItemPreview } from '../template-editor/PaletteRow';
import type { DragSource } from './dragSources';

/** The copy under the pointer carries no block id: the canvas's frame stays the one block of that id. */
const COPY_CHROME: BlockChrome = { decorate: () => ({ attributes: { 'data-block-id': undefined } }) };

interface BlockCopyProps {
  template: StatblockTemplate;
  id: string;
  record: FieldRecord;
  app: App | undefined;
  sourcePath: string | undefined;
}

/** A block drawn by the card's own renderer, alone, at the width dnd-kit gives the overlay (its frame's). */
function BlockCopy({ template, id, record, app, sourcePath }: BlockCopyProps): React.JSX.Element | null {
  const state = useMemo(() => sheetState({ template, record, mode: 'editing' }), [template, record]);
  const sheet = useMemo((): SheetContextValue => ({ state, app, sourcePath }), [state, app, sourcePath]);
  const block = findBlock(template.layout.blocks, id)?.block;
  if (!block) return null;
  return (
    <SheetContext.Provider value={sheet}>
      <BlockChromeContext.Provider value={COPY_CHROME}>
        <div className="atlas-statblock atlas-sb-sheet atlas-sb-sheet--full is-editing atlas-te-drag-sheet">
          <BlockView block={block} />
        </div>
      </BlockChromeContext.Provider>
    </SheetContext.Provider>
  );
}

export interface DragPreviewProps extends Omit<BlockCopyProps, 'id'> {
  source: DragSource;
}

/**
 * What moves under the pointer (§7.6): the block's own rendering, the
 * palette tile or the field row, at the size of what was picked up.
 */
export function DragPreview({ source, template, ...rest }: DragPreviewProps): React.JSX.Element | null {
  switch (source.kind) {
    case 'block': return <BlockCopy template={template} id={source.id} {...rest} />;
    case 'item': return <div className="atlas-te-drag-face atlas-te-drag-face--item"><ItemPreview item={source.item} /></div>;
    case 'field': {
      const field = fieldByKey(template.fields, source.key);
      return field ? <div className="atlas-te-fields__head atlas-te-drag-face"><FieldFace field={field} /></div> : null;
    }
  }
}
