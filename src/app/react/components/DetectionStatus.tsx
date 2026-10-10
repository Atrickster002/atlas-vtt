import React from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { EASE_OUT_CONTROL_POINTS, MOTION_NORMAL_MS } from '../../utils/motion';

const STATUS_TRANSITION = { duration: MOTION_NORMAL_MS / 1000, ease: EASE_OUT_CONTROL_POINTS };

interface DetectionStatusProps {
  /** What the detection is doing, in words. */
  status: string | null;
}

/**
 * A detection at work, where the button that started it was: the words that name its step, each
 * giving way to the next in place.
 */
export function DetectionStatus({ status }: DetectionStatusProps): React.ReactElement {
  return (
    <div className="atlas-grid-alignment-working-row">
      <MotionConfig reducedMotion="user">
        {/* The words stack in one cell, so one line gives way to the next in place */}
        <p className="atlas-grid-alignment-status" aria-live="polite">
          <AnimatePresence initial={false}>
            <motion.span
              key={status}
              className="atlas-grid-alignment-working"
              initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, filter: 'blur(2px)' }}
              transition={STATUS_TRANSITION}
            >
              {status}
            </motion.span>
          </AnimatePresence>
        </p>
      </MotionConfig>
    </div>
  );
}
