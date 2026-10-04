import React from 'react';
import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';
import { primaryOf, type BlockSelection } from '../selection';
import { BlockInspector } from './BlockInspector';
import { TemplateSettings } from './TemplateSettings';

/** The inspector crossfades when the selection changes (§7.10). */
const CROSSFADE_MS = 120;
const CROSSFADE: Transition = { duration: CROSSFADE_MS / 1000, ease: EASE_OUT_CONTROL_POINTS };

interface InspectorBodyProps {
  selection: BlockSelection;
  /** Ends the header row: the popover's close button. */
  headerEnd?: React.ReactNode;
}

/** What the inspector shows for a selection: one block's settings, the template's, or a word about several. */
export function InspectorBody({ selection, headerEnd }: InspectorBodyProps): React.JSX.Element {
  const primary = primaryOf(selection);
  if (primary === null) return <TemplateSettings header headerEnd={headerEnd} />;
  if (selection.length > 1) {
    return (
      <div className="atlas-te-insp__content">
        <div className="atlas-te-insp__header">
          <span className="atlas-te-insp__name">{selection.length} blocks</span>
          {headerEnd}
        </div>
        <p className="atlas-te-insp__locked">Select one block to change its settings.</p>
      </div>
    );
  }
  return <BlockInspector id={primary} headerEnd={headerEnd} />;
}

/** "template", one block's id, or the blocks picked together: the inspector fades when it changes. */
function contentKey(selection: BlockSelection): string {
  return selection.length === 0 ? 'template' : selection.join(' ');
}

/** `InspectorBody`, crossfading over 120 ms whenever another block (or none) is selected; opacity only. */
export function FadingInspectorBody(props: InspectorBodyProps): React.JSX.Element {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={contentKey(props.selection)}
        className="atlas-te-insp__fade"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={CROSSFADE}
      >
        <InspectorBody {...props} />
      </motion.div>
    </AnimatePresence>
  );
}
