/**
 * Opening the template editor (§4.6, §7.4, §8.4): in its own tab, in the tab
 * it already has for that template, or in a note's own leaf ("Edit template"
 * from a note), which can go back to the note. Every way in is behind the
 * `statblockEditor` experimental switch.
 */

import { Notice, type App, type WorkspaceLeaf } from 'obsidian';
import { experimentalFeatureOn } from '../../experimental/experimentalFeatures';
import { TemplateLibrary } from '../library/TemplateLibrary';
import { isBuiltInTemplateId, type TemplateId } from '../model/templateTypes';
import { TEMPLATE_EDITOR_VIEW_TYPE, readTemplateEditorState, type TemplateEditorEphemeral } from './templateEditorState';

export interface OpenTemplateEditorOptions {
  templateId: TemplateId;
  /** The template's file, where the library may not have read it yet (a copy made a moment ago). */
  path?: string | null | undefined;
  /** The statblock the canvas shows instead of sample values ("Edit template" from a statblock). */
  previewPath?: string | null | undefined;
  /** The collection context (§7.1). */
  collectionId?: string | null | undefined;
  /** A block to select once the editor shows. */
  select?: string | undefined;
  /** The leaf to open in; a new tab (or the template's own) when unset. */
  leaf?: WorkspaceLeaf | undefined;
  /** The note whose leaf this is ("Edit template" from a note, §8.4): the editor offers to go back to it. */
  fromNote?: string | null | undefined;
}

/** The leaf already editing the template, in any window. */
function editorLeafFor(app: App, id: TemplateId, path: string | null): WorkspaceLeaf | null {
  const leaves: WorkspaceLeaf[] = [];
  // A callback that returns a value stops Obsidian's iteration, so the body is a block.
  app.workspace.iterateAllLeaves((leaf) => {
    leaves.push(leaf);
  });
  return leaves.find((leaf) => {
    const view = leaf.getViewState();
    if (view.type !== TEMPLATE_EDITOR_VIEW_TYPE) return false;
    const state = view.state ?? {};
    return path ? state.file === path : readTemplateEditorState(state).templateId === id;
  }) ?? null;
}

/** Opens the template editor on a template; resolves with its leaf, or null when it did not open. */
export async function openTemplateEditor(app: App, options: OpenTemplateEditorOptions): Promise<WorkspaceLeaf | null> {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return null;
  const id = options.templateId;
  const builtIn = isBuiltInTemplateId(id);
  const path = builtIn ? null : options.path ?? TemplateLibrary.forApp(app).get(id)?.path ?? null;
  if (!builtIn && !path) {
    new Notice("Couldn't find that template.");
    return null;
  }
  const leaf = options.leaf ?? editorLeafFor(app, id, path) ?? app.workspace.getLeaf('tab');
  const common = { previewPath: options.previewPath ?? null, collectionId: options.collectionId ?? null, fromNote: options.fromNote ?? null };
  const state = path ? { file: path, ...common } : { templateId: id, ...common };
  const ephemeral: TemplateEditorEphemeral = {
    ...(options.select && { select: options.select }),
  };
  await leaf.setViewState({ type: TEMPLATE_EDITOR_VIEW_TYPE, state, active: true }, ephemeral);
  app.workspace.setActiveLeaf(leaf, { focus: true });
  return leaf;
}
