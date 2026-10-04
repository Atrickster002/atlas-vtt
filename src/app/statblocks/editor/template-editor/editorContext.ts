import { createContext, useContext } from 'react';
import type { App } from 'obsidian';
import type { InsertItem } from './insertItems';
import type { BlockSelection } from './selection';
import type { EditorSession, SessionSnapshot } from './sessionTypes';
import type { CollectionFieldKeys } from './useCollectionFieldKeys';

/**
 * What the template editor shares with the parts that float beside the card:
 * the dock's panels (Add, Structure, Properties, Template) and the Settings
 * panel, which read and change the same session and the same selection.
 */
export interface TemplateEditorContextValue {
  app: App | undefined;
  session: EditorSession;
  snapshot: SessionSnapshot;
  selection: BlockSelection;
  /** Selects blocks; focus moves to the primary one in the canvas when `focus` is set. */
  select: (selection: BlockSelection, focus?: boolean) => void;
  /** Inserts a block after the selection and selects it (§6.1: its label stays closed). */
  insert: (item: InsertItem) => void;
  /** Inserts a Value showing a new property of this name after the selection ("Make a value called mana"). */
  insertNamedStat: (name: string) => void;
  /** Opens a block's label for editing in the canvas. */
  editLabel: (id: string) => void;
  /** Says something in the view's live region. */
  announce: (text: string) => void;
  /** The collection context (§7.1): its notes' keys, its roles in questions. */
  collectionId: string | null;
  collectionKeys: CollectionFieldKeys;
  /** Opens the Settings panel for the selection (§2.7). */
  openSettings: () => void;
}

export const TemplateEditorContext = createContext<TemplateEditorContextValue | null>(null);

/** The template editor around a part; only parts rendered inside `TemplateEditor` may ask. */
export function useTemplateEditor(): TemplateEditorContextValue {
  const editor = useContext(TemplateEditorContext);
  if (!editor) throw new Error('A template editor part was rendered outside TemplateEditor.');
  return editor;
}
