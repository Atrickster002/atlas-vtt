import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { handledByAnotherControl } from '../../../../keyboard/tooltipEscape';
import { CloseButton } from '../../../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../../packages/components/primitives/dialogMotion';

export interface EditorDialogProps {
  /** An element of the editor: the dialog opens in its window. */
  anchor: HTMLElement;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** The actions, the confirming one last. */
  footer: React.ReactNode;
}

/**
 * A dialog the inspector asks in (§7.10): the panel motion, the modal's
 * corner, the close button in its header, closed by Escape unless a control
 * inside used the key.
 */
export function EditorDialog({ anchor, title, onClose, children, footer }: EditorDialogProps): React.JSX.Element {
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();

  useEffect(() => {
    const doc = anchor.doc;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || handledByAnotherControl(event)) return;
      event.preventDefault();
      onClose();
    };
    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }, [anchor, onClose]);

  return createPortal(
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-plugin atlas-te-dialog-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div className="atlas-te-dialog" variants={windowVariants} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="atlas-te-dialog__header">
          <h2 id={titleId}>{title}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="atlas-te-dialog__body">{children}</div>
        <div className="atlas-te-dialog__footer">{footer}</div>
      </motion.div>
    </motion.div>,
    anchor.doc.body,
  );
}
