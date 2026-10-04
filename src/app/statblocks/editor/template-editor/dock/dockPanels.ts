import type React from 'react';
import { LayoutTemplate, ListTree, Plus, TextCursorInput, type LucideIcon } from 'lucide-react';
import { BlocksPalette } from '../BlocksPalette';
import { PropertiesPanel } from '../PropertiesPanel';
import { TemplateSettings } from '../inspector/TemplateSettings';
import { Outline } from '../Outline';
import type { MenuDockEntry } from '../shell/capsuleMenu';
import type { DockPanelId } from './dockPrefs';

/** One of the dock's panels (§2.5, §10.7). */
export interface DockPanelSpec {
  id: DockPanelId;
  /** The dock button's name and the panel's title. */
  label: string;
  icon: LucideIcon;
  /** The same icon by Obsidian's name, for the capsule's ⋯ menu in a stacked view. */
  menuIcon: string;
  /** Mod+Alt+<digit> opens it while focus is in the editor. */
  digit: '1' | '2' | '3' | '4';
  Content: React.ComponentType;
}

export const DOCK_PANELS: readonly DockPanelSpec[] = [
  { id: 'add', label: 'Add', icon: Plus, menuIcon: 'plus', digit: '1', Content: BlocksPalette },
  { id: 'structure', label: 'Structure', icon: ListTree, menuIcon: 'list-tree', digit: '2', Content: Outline },
  { id: 'properties', label: 'Properties', icon: TextCursorInput, menuIcon: 'text-cursor-input', digit: '3', Content: PropertiesPanel },
  { id: 'template', label: 'Template', icon: LayoutTemplate, menuIcon: 'layout-template', digit: '4', Content: TemplateSettings },
];

export function dockPanel(id: DockPanelId): DockPanelSpec {
  return DOCK_PANELS.find((panel) => panel.id === id) ?? DOCK_PANELS[0]!;
}

/** The dock's panels as rows of the capsule's ⋯ menu, where a stacked view has no room for the dock. */
export function dockMenuEntries(open: (id: DockPanelId) => void): MenuDockEntry[] {
  return DOCK_PANELS.map((panel) => ({
    label: panel.id === 'add' ? 'Add block' : panel.label,
    icon: panel.menuIcon,
    open: () => open(panel.id),
  }));
}
