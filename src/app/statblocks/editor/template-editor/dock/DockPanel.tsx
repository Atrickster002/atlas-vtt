import React, { forwardRef } from 'react';
import { AnimatePresence, motion, type MotionStyle } from 'framer-motion';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';
import { dockPanel } from './dockPanels';
import type { DockPanelId } from './dockPrefs';
import { FloatingPanel } from './FloatingPanel';

/** Another dock button swaps the panel's contents with a crossfade (§14). */
const CROSSFADE = { duration: 0.12, ease: EASE_OUT_CONTROL_POINTS };

export interface DockPanelProps {
  id: DockPanelId;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onClose: () => void;
  /** Beside the dock, or under the capsule in a stacked view. */
  from: 'left' | 'top';
  width: number;
  /** In a stacked view: how far below the editor's top it opens (under the capsule). */
  top?: number | undefined;
  /** Folded to its header while the Settings panel needs the room. */
  collapsed: boolean;
}

/**
 * One dock panel at a time (§2.6): Add, Structure, Properties or Template,
 * floating to the right of the dock over the note column. Another dock button
 * swaps what it shows; the panel stays.
 */
export const DockPanel = forwardRef<HTMLDivElement, DockPanelProps>(({ id, pinned, onPinnedChange, onClose, from, width, top, collapsed }, ref) => {
  const spec = dockPanel(id);
  const style: MotionStyle = { width, ...(top !== undefined && { top }) };
  return (
    <FloatingPanel
      ref={ref}
      className="atlas-te-dock-panel"
      region="dock-panel"
      label={spec.label}
      pinned={pinned}
      onPinnedChange={onPinnedChange}
      onClose={onClose}
      from={from}
      collapsed={collapsed}
      style={style}
    >
      {(controls) => (
        <>
          <div className="atlas-te-floating__header">
            <span className="atlas-te-floating__title">{spec.label}</span>
            {controls}
          </div>
          {!collapsed && (
            <div className="atlas-te-floating__body">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={id}
                  className="atlas-te-floating__content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={CROSSFADE}
                >
                  <spec.Content />
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </FloatingPanel>
  );
});

DockPanel.displayName = 'DockPanel';
