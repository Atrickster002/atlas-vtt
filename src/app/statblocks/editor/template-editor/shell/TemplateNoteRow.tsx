import React, { forwardRef } from 'react';
import type { App } from 'obsidian';
import { cn } from '../../../../../utils/cn';
import { PanelFrame } from '../../panel-frame/PanelFrame';
import { PanelHost } from '../../panel-frame/PanelHost';
import { NoteBodyPreview } from './NoteBodyPreview';
import type { ShowWith } from './showWith';
import type { PanelRoom } from './usePanelRoom';
import './shell.scss';

export interface TemplateNoteRowProps {
  app: App | undefined;
  room: PanelRoom;
  showWith: ShowWith;
  /** The rendered note's text element, whose readable line the panel's width follows. */
  previewRef: React.RefObject<HTMLDivElement | null>;
  openNote: (path: string) => void;
  /** The header capsule. */
  capsule: React.ReactNode;
  stateBars: React.ReactNode;
  /** The card: the canvas. */
  card: React.ReactNode;
  footer: React.ReactNode;
}

/**
 * The template editor's middle (§2.1, §2.2): the row a note view has, the
 * note on the left and the statblock panel on the right, built from the same
 * host and frame as the note view's panel, at the width the user's notes give
 * it. Below 720 px the card stands above the note, as in a note view.
 */
export const TemplateNoteRow = forwardRef<HTMLDivElement, TemplateNoteRowProps>((props, ref) => {
  const { app, room } = props;
  return (
    <div ref={ref} className={cn('atlas-te-row', room.stacked && 'atlas-sb-note--stacked')}>
      <NoteBodyPreview app={app} showWith={props.showWith} previewRef={props.previewRef} onOpenNote={props.openNote} />
      <PanelHost
        width={room.width}
        stacked={room.stacked}
        availableWidth={room.availableWidth}
        onResize={room.onResize}
        onCancelResize={room.onCancelResize}
        onResetWidth={room.onResetWidth}
      >
        <PanelFrame header={props.capsule} stateBars={props.stateBars} footer={props.footer}>
          {props.card}
        </PanelFrame>
      </PanelHost>
    </div>
  );
});

TemplateNoteRow.displayName = 'TemplateNoteRow';
