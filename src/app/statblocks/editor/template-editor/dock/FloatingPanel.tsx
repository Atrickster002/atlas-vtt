import React, { forwardRef, useRef } from 'react';
import { motion, useReducedMotion, type MotionStyle, type Variants } from 'framer-motion';
import { Pin } from 'lucide-react';
import { handledByAnotherControl } from '../../../../keyboard/tooltipEscape';
import { CloseButton } from '../../../../packages/components/primitives/CloseButton';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { cn } from '../../../../../utils/cn';
import { EASE_OUT_CONTROL_POINTS, PANEL_ENTER_MS, PANEL_EXIT_MS } from '../../../../utils/motion';
import { useOutsidePress } from './useOutsidePress';

const ENTER = { duration: PANEL_ENTER_MS / 1000, ease: EASE_OUT_CONTROL_POINTS };
const EXIT = { duration: PANEL_EXIT_MS / 1000, ease: EASE_OUT_CONTROL_POINTS };

/** Slides in 8 px from its anchor's side and grows from 97 % (§14); only fades where motion is reduced. */
function panelVariants(from: 'left' | 'top', reduced: boolean): Variants {
  const offset = reduced ? {} : { ...(from === 'left' ? { x: -8 } : { y: -8 }), scale: 0.97 };
  return {
    hidden: { opacity: 0, ...offset },
    visible: { opacity: 1, x: 0, y: 0, scale: 1, transition: ENTER },
    exit: { opacity: 0, ...offset, transition: EXIT },
  };
}

export interface FloatingPanelProps {
  className?: string | undefined;
  /** Its region for the editor's Tab order (`data-te-region`). */
  region: string;
  /** The panel's name for assistive technology. */
  label: string;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onClose: () => void;
  /** Where it opens from: beside the dock (left) or under the capsule (top). */
  from: 'left' | 'top';
  /** Folded to its header while another panel needs the room. */
  collapsed?: boolean | undefined;
  style?: MotionStyle | undefined;
  /** The panel's contents, given its pin and close buttons to put in its header. */
  children: (controls: React.ReactNode) => React.ReactNode;
}

/**
 * A floating panel of the template editor (§2.6, §2.7): an elevated surface
 * with the panel radius, a header with pin and close, contents scrolling
 * inside. Unpinned it closes on Escape, its close button, and a press outside
 * it and outside the card.
 */
export const FloatingPanel = forwardRef<HTMLDivElement, FloatingPanelProps>((props, forwarded) => {
  const { pinned, onPinnedChange, onClose, from, collapsed = false } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion() ?? false;
  useOutsidePress(ref, !pinned, onClose);
  const setRef = (element: HTMLDivElement | null): void => {
    ref.current = element;
    if (typeof forwarded === 'function') forwarded(element);
    else if (forwarded) forwarded.current = element;
  };

  const controls = (
    <span className="atlas-te-floating__controls">
      {/* The pin shows its state, filled while pinned; its tooltip says what a click does. */}
      <span className="atlas-te-floating__pin" data-pinned={pinned || undefined}>
        <ToolButton icon={Pin} label={pinned ? 'Pinned · Click to unpin' : 'Pin open'} isActive={pinned} onClick={() => onPinnedChange(!pinned)} />
      </span>
      <CloseButton onClick={onClose} />
    </span>
  );

  return (
    <motion.div
      ref={setRef}
      className={cn('atlas-te-floating', props.className)}
      {...(props.style !== undefined && { style: props.style })}
      data-te-region={props.region}
      data-from={from}
      data-collapsed={collapsed ? '' : undefined}
      role="dialog"
      aria-label={props.label}
      variants={panelVariants(from, reduced)}
      initial="hidden"
      animate="visible"
      exit="exit"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || handledByAnotherControl(event.nativeEvent)) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      {props.children(controls)}
    </motion.div>
  );
});

FloatingPanel.displayName = 'FloatingPanel';
