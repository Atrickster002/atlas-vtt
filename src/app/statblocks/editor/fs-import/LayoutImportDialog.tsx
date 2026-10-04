import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { useDialogEscape } from '../../../packages/components/primitives/useDialogEscape';
import type { FsLayoutImport, LayoutIdentity } from '../../fs/fsImport';
import { adoptLabel } from './importReportText';
import { AdoptionSection, ImportSummary } from './LayoutImportParts';
import { useLayoutAdoption } from './useLayoutAdoption';
import './layout-import-dialog.scss';

export interface LayoutImportDialogProps {
  app: App;
  /** The document of the window the dialog opens in. */
  doc: Document;
  layout: LayoutIdentity;
  /** The layout's template, with the report of an import made just now. */
  imported: FsLayoutImport;
  /** The statblocks the layout draws, which the batch adopts. */
  notes: readonly string[];
  /** Opens the template in the template editor; without it there is no Open template. */
  onOpenTemplate?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * The import report (§6.2) and the adoption batch (§6.4) in one dialog: what
 * the import made, Track blocks for scripts that drew tracks, and "Use
 * <template> for the 214 notes using layout <X>" with the notes listed first,
 * progress and Cancel. Without a report (the layout was imported before) it
 * is the batch alone.
 */
export function LayoutImportDialog({ app, doc, layout, imported, notes, onOpenTemplate, onClose }: LayoutImportDialogProps): React.JSX.Element {
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const { phase, adopt, cancel } = useLayoutAdoption(app, notes, imported.id);
  const running = phase.kind === 'running';
  // Closing while notes are switched stops at the next note.
  const close = (): void => {
    cancel();
    onClose();
  };
  useDialogEscape(windowRef, close);
  useEffect(() => windowRef.current?.focus({ preventScroll: true }), []);

  const title = imported.report ? `Imported ${layout.name}` : layout.name;
  return createPortal(
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-plugin atlas-te-dialog-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !running) close(); }}
    >
      <motion.div
        ref={windowRef}
        className="atlas-te-dialog atlas-fs-import"
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="atlas-te-dialog__header">
          <h2 id={titleId}>{title}</h2>
          <CloseButton onClick={close} />
        </div>
        <div className="atlas-te-dialog__body">
          {imported.report
            ? <ImportSummary app={app} templateId={imported.id} report={imported.report} />
            : <p className="atlas-te-dialog__text">Imported before as {imported.name}.</p>}
          {notes.length > 0 && (
            <AdoptionSection notes={notes} label={adoptLabel(imported.name, notes.length, layout.name)} phase={phase} onAdopt={adopt} />
          )}
        </div>
        <div className="atlas-te-dialog__footer">
          {running ? (
            <Button type="button" variant="outline" size="sm" onClick={cancel}>Cancel</Button>
          ) : (
            <>
              {onOpenTemplate && (
                <Button type="button" variant="outline" size="sm" onClick={() => { onOpenTemplate(); close(); }}>Open template</Button>
              )}
              <Button type="button" size="sm" onClick={close}>Done</Button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>,
    doc.body,
  );
}
