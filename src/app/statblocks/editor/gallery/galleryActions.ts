/**
 * What the template gallery makes (§7.9): an editable template in the
 * library, copied from a card, built from a statblock's values or blank; and
 * where it goes next, the template editor or a role of the collection.
 */

import { Notice, type App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { systemPresetsOf } from '../../../services/mapCollectionRules';
import { identityOf, importFsLayout, type FsLayoutImport, type LayoutIdentity } from '../../fs/fsImport';
import type { FsLayout } from '../../fs/fsLayoutTypes';
import { copyTemplate, createTemplateFile } from '../../library/templateActions';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { StatblockTemplate, TemplateId } from '../../model/templateTypes';
import type { FrontmatterRecord } from '../../notes/statblockSource';
import { collectionStatblockRoles, editedStatblockRoles } from '../../roles/collectionStatblockRoles';
import { openTemplateEditor } from '../openTemplateEditor';
import { blankTemplate, firstBlockId } from './gallerySources';
import { noteName } from '../../../utils/pathUtils';
import { statblockTemplate } from './statblockNotes';

/** What the user picked in the gallery. */
export type GalleryPick =
  | { kind: 'template'; entry: LibraryTemplate }
  | { kind: 'statblock'; path: string; template: StatblockTemplate }
  | { kind: 'fs-layout'; layout: FsLayout }
  | { kind: 'blank' };

/** A template the gallery made, and what the editor needs to open it. */
export interface CreatedTemplate {
  id: TemplateId;
  path: string;
  /** A Fantasy Statblocks layout's template, imported now or before: the gallery shows the report as it closes. */
  fsImport?: { layout: LayoutIdentity; imported: FsLayoutImport } | undefined;
}

const BLANK_NAME = 'New template';

/** Writes the picked template into the library as a template of its own. */
export async function createFromPick(app: App, pick: GalleryPick): Promise<CreatedTemplate> {
  switch (pick.kind) {
    case 'template':
      return copyTemplate(app, pick.entry.template.id, pick.entry.name);
    case 'statblock':
      return createTemplateFile(app, noteName(pick.path), pick.template);
    case 'fs-layout': {
      // A layout is imported once: picked again, it opens the template it gave.
      const imported = await importFsLayout(app, pick.layout);
      return { id: imported.id, path: imported.path, fsImport: { layout: identityOf(pick.layout), imported } };
    }
    case 'blank':
      return createTemplateFile(app, BLANK_NAME, blankTemplate());
  }
}

/** The role of the collection starts from `templateId`; the collection keeps following its system where that is the system's. */
export async function assignRoleTemplate(app: App, collectionId: string, roleId: string, templateId: TemplateId): Promise<void> {
  const assets = AssetService.getInstance(app);
  const settings = assets.getCollectionSettings(collectionId);
  const presets = systemPresetsOf(app);
  const roles = collectionStatblockRoles(settings, presets).map((role) => (role.id === roleId ? { ...role, templateId } : role));
  const system = presets.find((preset) => preset.id === settings.systemPresetId)?.rules.statblockRoles;
  await assets.updateCollectionSettings(collectionId, { statblockRoles: editedStatblockRoles(roles, system) });
}

/**
 * After the gallery: the role takes the template, and the template editor
 * opens on it with nothing selected, so the card shows as a note shows it
 * and no toolbar covers a line. A copy made here switches no statblock.
 */
export async function openCreatedTemplate(app: App, created: CreatedTemplate, collectionId: string | null, roleId: string | null): Promise<void> {
  if (collectionId !== null && roleId !== null) await assignRoleTemplate(app, collectionId, roleId, created.id);
  await openTemplateEditor(app, { templateId: created.id, path: created.path, collectionId });
}

/**
 * Save as a template (§6.4): a Fantasy Statblocks statblock read without the
 * plugin becomes a template of the library, shaped like its auto template,
 * and opens in the template editor previewing the statblock.
 */
export async function saveStatblockAsTemplate(app: App, notePath: string, values: FrontmatterRecord, collectionId: string | null): Promise<void> {
  const template = statblockTemplate(values);
  if (!template) {
    new Notice('This statblock has no values to build a template from.');
    return;
  }
  try {
    const created = await createTemplateFile(app, noteName(notePath), template);
    await openTemplateEditor(app, {
      templateId: created.id, path: created.path, previewPath: notePath, collectionId, select: firstBlockId(template) ?? undefined,
    });
  } catch (error) {
    console.error('[Atlas] Saving the statblock as a template failed:', error);
    new Notice("Couldn't save the template.");
  }
}
