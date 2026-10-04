/**
 * Creating, copying and deleting templates (§4.3, §8.7). New templates are
 * files of their own in the library folder, under ids that never change.
 * Deleting looks at what uses the template first and can move it all to
 * another one; without a replacement the notes keep naming the deleted
 * template and render with the auto template.
 */

import type { App } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import { SystemPresetFiles } from '../../services/systemPresets/SystemPresetFiles';
import { SystemPresetService } from '../../services/SystemPresetService';
import type { StatblockRole } from '../model/roleTypes';
import { isBuiltInTemplateId, type StatblockTemplate, type TemplateId } from '../model/templateTypes';
import { switchTemplates } from '../notes/templateSwitch';
import { builtInTemplate } from './builtInTemplates';
import { flushTemplateSession } from './sessionRegistry';
import { TemplateLibrary } from './TemplateLibrary';
import { copyName } from './templatePaths';
import { templateUsage } from './templateUsage';
import { newTemplateFile } from './templateWriter';

export { TEMPLATE_FOLDER } from './templatePaths';

/** A new template file in the library folder, named after `name` (the next free name when taken), under a new id. */
export function createTemplateFile(app: App, name: string, template: StatblockTemplate): Promise<{ id: TemplateId; path: string }> {
  return newTemplateFile(app, TemplateLibrary.forApp(app), name, template);
}

/**
 * A copy of a template as it is now (an open session's draft included), as a
 * template of its own. It records where it came from, with a built-in's
 * revision, and keeps the source's licence and attribution. The source stays.
 */
export function copyTemplate(app: App, id: TemplateId, name?: string): Promise<{ id: TemplateId; path: string }> {
  const library = TemplateLibrary.forApp(app);
  const source = library.current(id);
  if (!source) return Promise.reject(new Error(`There is no template with the id ${id}.`));
  const revision = builtInTemplate(id)?.revision;
  const derivedFrom = revision === undefined ? { templateId: id } : { templateId: id, revision };
  return newTemplateFile(app, library, name?.trim() || copyName(source.name), { ...source.template, derivedFrom });
}

/**
 * Deletes a template's file into the trash. Pending edits are written first;
 * with a `replacement`, every statblock that names the template switches to
 * it (one batch, notes changed meanwhile keep theirs) and every role that
 * starts from it, a collection's own or a saved system's, starts from the
 * replacement. Without one, notes and roles are left as they are.
 */
export async function deleteTemplate(app: App, id: TemplateId, replacement: TemplateId | null): Promise<void> {
  if (isBuiltInTemplateId(id)) throw new Error('Built-in templates can\'t be deleted.');
  await flushTemplateSession(app, id);
  if (replacement !== null && replacement !== id) {
    const usage = templateUsage(app, id);
    await switchTemplates(app, usage.notes.map((path) => ({ path, from: id })), replacement);
    await replaceRoleTemplates(app, id, replacement);
  }
  const path = TemplateLibrary.forApp(app).get(id)?.path;
  const file = path ? app.vault.getFileByPath(path) : null;
  if (file) await app.fileManager.trashFile(file);
}

function rolesWith(roles: readonly StatblockRole[] | undefined, from: TemplateId, to: TemplateId): StatblockRole[] | null {
  if (!roles?.some((role) => role.templateId === from)) return null;
  return roles.map((role) => (role.templateId === from ? { ...role, templateId: to } : role));
}

/** Roles that start from `from` start from `to`: the collections' own roles and those of saved systems. */
async function replaceRoleTemplates(app: App, from: TemplateId, to: TemplateId): Promise<void> {
  const assets = AssetService.getInstance(app);
  for (const collection of assets.loadedCollections()) {
    const statblockRoles = rolesWith(collection.settings?.statblockRoles, from, to);
    if (statblockRoles) await assets.updateCollectionSettings(collection.id, { statblockRoles });
  }
  const files = SystemPresetFiles.forApp(app);
  if (!files) return;
  const presets = new SystemPresetService(files);
  for (const preset of presets.list()) {
    const statblockRoles = preset.builtIn ? null : rolesWith(preset.rules.statblockRoles, from, to);
    if (statblockRoles) presets.update(preset.id, { ...preset.rules, statblockRoles });
  }
}
