import { TFile, type App } from 'obsidian';
import type { StatblockRole } from '../../model/roleTypes';
import { roleNameFor } from '../collectionContext';
import type { HeaderTemplate } from './PaneHeader';
import type { StatblockPaneActions } from './paneTypes';
import type { PaneNote } from './usePaneNote';
import type { PaneTemplate } from './usePaneTemplate';

interface HeaderTemplateInput {
  app: App;
  note: PaneNote;
  paneTemplate: PaneTemplate;
  roles: readonly StatblockRole[];
  collectionId: string | null;
  actions: StatblockPaneActions;
  /** Opens Change template…; unset where the template cannot be changed. */
  choose: (() => void) | undefined;
}

/** Opens a template's file in a new tab, where the template editor shows it. */
function openTemplateFile(app: App, path: string): void {
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) void app.workspace.getLeaf('tab').openFile(file);
}

/**
 * What the header's template button says and offers (§7.2): "Monster · Marsh
 * creature" with Edit template, Change template… and Open template file; a
 * lock for built-ins and templates of a newer Atlas. None for a note that is
 * no native statblock.
 */
export function headerTemplate({ app, note, paneTemplate, roles, collectionId, actions, choose }: HeaderTemplateInput): HeaderTemplate | null {
  const templateId = note.templateId;
  if (note.kind !== 'atlas' || !templateId || paneTemplate.status === 'loading') return null;
  if (paneTemplate.status === 'missing') return { name: 'Template not found', roleName: null, locked: false, change: choose };
  const { entry } = paneTemplate;
  const edit = choose && paneTemplate.status !== 'newer' ? actions.editTemplate : undefined;
  return {
    name: entry.name,
    roleName: roleNameFor(roles, templateId),
    locked: entry.builtIn || paneTemplate.status === 'newer',
    // A built-in opens too: its first change there makes the collection's own copy (§9.3).
    edit: edit ? () => edit(templateId, collectionId, note.snapshot.path) : undefined,
    change: choose,
    openFile: entry.path ? () => openTemplateFile(app, entry.path ?? '') : undefined,
  };
}
