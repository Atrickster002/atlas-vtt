/** The template editor's view type and the state Obsidian saves for it in the workspace. */

import { isBuiltInTemplateId, type TemplateId } from '../model/templateTypes';
import type { ShowWithMode } from './template-editor/shell/showWith';

/** A `FileView` for `.atlastemplate` files; built-ins open in it by id, without a file. */
export const TEMPLATE_EDITOR_VIEW_TYPE = 'atlas-statblock-template';

export interface TemplateEditorState {
  /** A built-in's id. A vault template is named by its file (`state.file`, which `FileView` keeps). */
  templateId: TemplateId | null;
  /** The statblock the editor shows its template with ("Show with"). */
  previewPath: string | null;
  /** Show with Sample or Empty, as chosen; null while nothing was chosen (the statblock changed last, else Sample). */
  previewMode: ShowWithMode | null;
  /** The collection the editor works for (§7.1); null for the default one. */
  collectionId: string | null;
  /** The note "Edit template" swapped this leaf from (§8.4): "Back to <note>" returns to it. */
  fromNote: string | null;
}

/** What `openTemplateEditor` asks of the view once, never saved: the block to select. */
export interface TemplateEditorEphemeral {
  select?: string | undefined;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** The editor's state from a saved workspace or a `setViewState` call; only a built-in's id is taken from it. */
export function readTemplateEditorState(state: unknown): TemplateEditorState {
  const record = state !== null && typeof state === 'object' ? state as Record<string, unknown> : {};
  const { templateId, previewPath, previewMode, collectionId, fromNote } = record;
  return {
    templateId: isText(templateId) && isBuiltInTemplateId(templateId) ? templateId : null,
    previewPath: isText(previewPath) ? previewPath : null,
    previewMode: previewMode === 'sample' || previewMode === 'empty' ? previewMode : null,
    collectionId: isText(collectionId) ? collectionId : null,
    fromNote: isText(fromNote) ? fromNote : null,
  };
}

export function readTemplateEditorEphemeral(state: unknown): TemplateEditorEphemeral {
  const record = state !== null && typeof state === 'object' ? state as Record<string, unknown> : {};
  return {
    ...(isText(record.select) && { select: record.select }),
  };
}
