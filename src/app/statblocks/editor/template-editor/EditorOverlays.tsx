import React from 'react';
import { AnimatePresence } from 'framer-motion';
import type { App } from 'obsidian';
import { InsertMenu } from './InsertMenu';
import type { SessionSnapshot } from './sessionTypes';
import { TeSurfaceChrome } from './TeSurfaceChrome';
import { UndoToast } from './UndoToast';
import type { EditorState } from './useEditorState';
import type { KeyboardTarget } from './useTemplateKeyboard';

export interface EditorOverlaysProps {
  app: App | undefined;
  /** The layer over the editor that floating parts are drawn in. */
  layer: HTMLElement | null;
  stage: HTMLElement | null;
  snapshot: SessionSnapshot;
  state: EditorState;
  target: KeyboardTarget;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  /** Opens the Settings panel for the selected block. */
  onSettings?: (() => void) | undefined;
}

/**
 * What floats over the template editor: the gutter handles, the selected
 * block's toolbar and the block menus, the insert menu, the delete toast,
 * and the polite live region every announcement goes to, inside the view's
 * own document.
 */
export function EditorOverlays({ app, layer, stage, snapshot, state, target, menuOpen, onMenuOpenChange, onSettings }: EditorOverlaysProps): React.JSX.Element {
  return (
    <>
      {layer && stage && (
        <TeSurfaceChrome
          layer={layer}
          stage={stage}
          snapshot={snapshot}
          state={state}
          target={target}
          menuOpen={menuOpen}
          onMenuOpenChange={onMenuOpenChange}
          onSettings={onSettings}
        />
      )}
      <AnimatePresence>
        {layer && state.insertMenu && (
          <InsertMenu
            key={state.insertMenu.opening}
            layer={layer}
            anchor={state.insertMenu.anchor}
            app={app}
            onInsert={(item) => state.insert(item, state.insertMenu?.place)}
            onClose={state.closeInsert}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {state.toast && (
          <UndoToast key={state.toast.text} text={state.toast.text} onUndo={() => target.session.undo()} onDismiss={state.dismissToast} />
        )}
      </AnimatePresence>
      <div className="atlas-te-live" role="status" aria-live="polite">{state.said}</div>
    </>
  );
}
