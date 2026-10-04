import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import type { ImageBlock } from '../../model/templateTypes';
import { valueText } from '../../values/valueText';
import { usePaneEdit } from '../statblock-pane/paneEditContext';
import { TokenLinkPanel } from './TokenLinkPanel';
import { TokenSocketFace } from './TokenSocketFace';
import { artSrc, artToken } from './tokenSocketActions';
import { useSocketPlacement } from './useSocketPlacement';
import './token-socket.scss';

export interface TokenSocketProps {
  block: ImageBlock;
  /** The art as the card draws it; shown inside the socket while the note names an image the vault holds. */
  art: React.ReactNode;
}

/**
 * The Image block in the statblock beside its note: a button around the art
 * (or an empty socket) that opens the panel where tokens are linked to the
 * statblock and its art is chosen. The runtime card has no socket.
 */
export function TokenSocket({ block, art }: TokenSocketProps): React.JSX.Element {
  const pane = usePaneEdit();
  const field = pane.sheet.fields.get(block.field);
  const [socket, setSocket] = useState<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // A token's ring changes outside the note: the socket draws the art again when the asset index says so.
  const [, assetsChanged] = useReducer((count: number): number => count + 1, 0);
  useEffect(() => {
    const ref = pane.app.workspace.on('atlas-vtt:refresh-assets', assetsChanged);
    return () => pane.app.workspace.offref(ref);
  }, [pane.app]);
  const variants = useAnchoredPopoverVariants();
  const placement = useSocketPlacement(socket, open);
  const keepInView = useKeepInView(popoverRef, open && placement !== null, placement?.above ? 'top' : 'bottom', placement?.key);

  const close = useCallback((refocus: boolean): void => {
    setOpen(false);
    if (refocus) socket?.focus({ preventScroll: true });
  }, [socket]);

  const placed = placement !== null;
  useEffect(() => {
    if (open && placed) searchRef.current?.focus({ preventScroll: true });
  }, [open, placed]);

  // A press outside the socket and its panel closes the panel; Escape inside either closes it and returns focus.
  useEffect(() => {
    const doc = socket?.doc;
    if (!open || !doc) return undefined;
    // Paths, not `instanceof`: a popout window's nodes are not this window's `Node`s.
    const within = (event: Event): boolean => event.composedPath().some((target) => target === socket || target === popoverRef.current);
    const onPointerDown = (event: PointerEvent): void => {
      if (!within(event)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !within(event) || handledByAnotherControl(event)) return;
      // Obsidian's own Escape would move focus on to the note's editor.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    // The panel hangs in the window's body: it goes with its socket when another tab hides the note.
    const { workspace } = pane.app;
    const onLayout = (): void => {
      if (!socket.isShown()) close(false);
    };
    const refs = [workspace.on('active-leaf-change', onLayout), workspace.on('layout-change', onLayout)];
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      for (const ref of refs) workspace.offref(ref);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown);
    };
  }, [open, socket, close, pane.app]);

  if (!field || !pane.writable) return <>{art}</>;
  const src = artSrc(pane, field);
  const named = valueText(pane.read(field).value) !== '';
  const ring = artToken(pane, field)?.showRing !== false;
  const shown = block.shape === 'token' && src
    ? <TokenPortrait className="atlas-sb-token-image" src={src} alt="" showRing={ring} />
    : art;

  return (
    <>
      <LabelTooltip label="Link token art">
        <TokenSocketFace
          ref={setSocket}
          shape={block.shape}
          art={src ? shown : null}
          prompt={named ? 'Art not found' : 'Add token art'}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        />
      </LabelTooltip>
      {socket && createPortal(
        <AnimatePresence>
          {open && placement && (
            <div
              key="token-panel"
              ref={popoverRef}
              className="atlas-vtt-plugin atlas-sb-token-popover"
              data-above={placement.above || undefined}
              style={{ ...placement.style, ...keepInView.style }}
            >
              <motion.div className="atlas-sb-token-popover__motion" variants={variants} initial="hidden" animate="visible" exit="exit">
                <TokenLinkPanel pane={pane} field={field} collectionId={pane.collectionId} onClose={close} searchRef={searchRef} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        socket.doc.body,
      )}
    </>
  );
}
