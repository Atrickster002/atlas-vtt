import React, { forwardRef } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { shortcutText } from '../shortcutText';
import { DOCK_PANELS } from './dockPanels';
import type { DockPanelId } from './dockPrefs';

export interface EditorDockProps {
  /** The panel open now; its button is ringed in the accent. */
  open: DockPanelId | null;
  onToggle: (id: DockPanelId) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * The template editor's dock (§2.5): a vertical capsule floating at the note
 * column's left edge with the four panels (Add, Structure, Properties,
 * Template) and the session's undo and redo. Each button names its key.
 */
export const EditorDock = forwardRef<HTMLDivElement, EditorDockProps>(({ open, onToggle, canUndo, canRedo, onUndo, onRedo }, ref) => (
  <div ref={ref} className="atlas-te-dock" role="toolbar" aria-orientation="vertical" aria-label="Template tools" data-te-region="dock">
    {DOCK_PANELS.map((panel) => (
      <ToolButton
        key={panel.id}
        icon={panel.icon}
        label={panel.label}
        shortcut={shortcutText(['Mod', 'Alt'], panel.digit)}
        isActive={open === panel.id}
        onClick={() => onToggle(panel.id)}
      />
    ))}
    <span className="atlas-te-dock__divider" aria-hidden="true" />
    <ToolButton icon={Undo2} label="Undo" shortcut={shortcutText(['Mod'], 'Z')} isActive={false} disabled={!canUndo} onClick={onUndo} />
    <ToolButton icon={Redo2} label="Redo" shortcut={shortcutText(['Mod', 'Shift'], 'Z')} isActive={false} disabled={!canRedo} onClick={onRedo} />
  </div>
));

EditorDock.displayName = 'EditorDock';
