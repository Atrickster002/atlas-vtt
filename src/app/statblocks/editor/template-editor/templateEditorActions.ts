/** The header menu's actions that reach beyond the template (§7.4): a new statblock, a duplicate. */

import { Notice, type App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { systemPresetsOf } from '../../../services/mapCollectionRules';
import { copyTemplate } from '../../library/templateActions';
import type { TemplateId } from '../../model/templateTypes';
import { createStatblockNote } from '../../notes/createStatblockNote';
import { collectionStatblockRoles, roleFolder } from '../../roles/collectionStatblockRoles';
import { openStatblockEditor } from '../openStatblockEditor';

/** The folder of the one role of the collection that starts from the template; Obsidian's folder otherwise. */
function folderFor(app: App, templateId: TemplateId, collectionId: string | null): string | undefined {
  if (collectionId === null) return undefined;
  const settings = AssetService.getInstance(app).getCollectionSettings(collectionId);
  const roles = collectionStatblockRoles(settings, systemPresetsOf(app)).filter((role) => role.templateId === templateId);
  const [only] = roles;
  return roles.length === 1 && only ? roleFolder(settings, only.id) : undefined;
}

/** New statblock from this template: a note named "New statblock" in its role's folder, opened with its statblock beside it. */
export async function newStatblockFromTemplate(app: App, templateId: TemplateId, collectionId: string | null): Promise<void> {
  try {
    const { file } = await createStatblockNote(app, { name: 'New statblock', templateId, folder: folderFor(app, templateId, collectionId) });
    await openStatblockEditor(app, { notePath: file.path, collectionId, from: 'command', focusFirstEmpty: true });
  } catch (error) {
    console.error('[Atlas] Creating a statblock failed:', error);
    new Notice("Couldn't create the statblock.");
  }
}

/** A template the editor opens: a vault template's file, or a built-in's id (`path` null). */
export interface TemplateTarget {
  id: TemplateId;
  path: string | null;
}

/** A copy of the template as it is now, as a template of its own; null where it could not be made. */
export async function duplicateTemplate(app: App, templateId: TemplateId): Promise<TemplateTarget | null> {
  try {
    return await copyTemplate(app, templateId);
  } catch (error) {
    console.error('[Atlas] Copying a template failed:', error);
    new Notice("Couldn't copy the template.");
    return null;
  }
}
