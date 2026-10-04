import React, { useLayoutEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { SettingsPanel } from '../settings/SettingsPanel';
import type { BlockSelection } from '../selection';
import type { EditorSession, SessionSnapshot } from '../sessionTypes';
import { dockPanelFit, PANEL_GAP, type EditorWidth } from './dockPlacement';
import { DockPanel } from './DockPanel';
import { EditorDock } from './EditorDock';
import type { FloatingPanels } from './useFloatingPanels';
import './dock.scss';

export interface EditorFloatsProps {
  /** The editor's root, which everything here floats in. */
  root: HTMLElement | null;
  stage: HTMLElement | null;
  session: EditorSession;
  snapshot: SessionSnapshot;
  selection: BlockSelection;
  floats: FloatingPanels;
  width: EditorWidth;
  noteColumn: number;
}

/** In a stacked view the dock's panels open under the capsule: how far below the editor's top that is. */
function useCapsuleBottom(root: HTMLElement | null, active: boolean): number | undefined {
  const [bottom, setBottom] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const capsule = active ? root?.querySelector<HTMLElement>('.atlas-te-capsule') : null;
    if (!root || !capsule) {
      setBottom(undefined);
      return;
    }
    setBottom(capsule.getBoundingClientRect().bottom - root.getBoundingClientRect().top + PANEL_GAP);
  }, [root, active]);
  return bottom;
}

/**
 * What floats over the template editor's note column (§2.5–2.8): the dock
 * with its open panel, and the Settings panel beside the card. In a stacked
 * view the dock's buttons move into the capsule's ⋯ menu and its panels open
 * under the capsule.
 */
export function EditorFloats({ root, stage, session, snapshot, selection, floats, width, noteColumn }: EditorFloatsProps): React.JSX.Element {
  const fit = dockPanelFit(noteColumn, width);
  const underCapsule = fit.kind === 'popover';
  const capsuleBottom = useCapsuleBottom(root, underCapsule && floats.dock.open !== null);
  const dockOpen = floats.dock.open !== null && !floats.dockHidden;

  return (
    <>
      {width !== 'stacked' && (
        <EditorDock
          open={floats.dock.open}
          onToggle={floats.toggleDock}
          canUndo={snapshot.canUndo}
          canRedo={snapshot.canRedo}
          onUndo={() => session.undo()}
          onRedo={() => session.redo()}
        />
      )}
      <AnimatePresence>
        {dockOpen && floats.dock.open && (
          <DockPanel
            key="dock-panel"
            id={floats.dock.open}
            pinned={floats.dock.pinned}
            onPinnedChange={floats.pinDock}
            onClose={floats.closeDock}
            from={underCapsule ? 'top' : 'left'}
            width={fit.width}
            top={underCapsule ? capsuleBottom : undefined}
            collapsed={floats.dockCollapsed}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {floats.settings.open && root && (
          <SettingsPanel
            key="settings"
            root={root}
            stage={stage}
            selection={selection}
            revision={snapshot.template}
            width={width}
            pinned={floats.settings.pinned}
            onPinnedChange={floats.pinSettings}
            onClose={floats.closeSettings}
          />
        )}
      </AnimatePresence>
    </>
  );
}
