/**
 * A collection's own copy of a built-in template (spec §9.1). Built-ins are
 * never changed; every structural change reached from a note on a built-in
 * goes to the collection's copy, made once and recorded in
 * `CollectionSettings.templateCopies`, so a collection holds at most one copy
 * per built-in and Atlas never makes a copy per monster on its own.
 */

import type { App } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import type { LibraryTemplate, TemplateLookup } from '../model/resolvedTypes';
import { isBuiltInTemplateId, type TemplateId } from '../model/templateTypes';
import { copyTemplate } from './templateActions';
import { TemplateLibrary } from './TemplateLibrary';

/** The recorded copy of `builtInId`, where it is still a template that derives from that built-in; null otherwise. */
export function ownCopyOf(
  settings: Pick<CollectionSettings, 'templateCopies'> | null | undefined,
  library: TemplateLookup,
  builtInId: TemplateId,
): LibraryTemplate | null {
  const id = settings?.templateCopies?.[builtInId];
  if (typeof id !== 'string' || isBuiltInTemplateId(id)) return null;
  const copy = library.get(id);
  return copy && !copy.builtIn && copy.template.derivedFrom?.templateId === builtInId ? copy : null;
}

/** Settings that record `copyId` as the collection's copy of `builtInId`; other copies stay recorded. */
export function withOwnCopy(settings: Pick<CollectionSettings, 'templateCopies'>, builtInId: TemplateId, copyId: TemplateId): Partial<CollectionSettings> {
  return { templateCopies: { ...settings.templateCopies, [builtInId]: copyId } };
}

export interface OwnCopy {
  id: TemplateId;
  /** The copy's file; null where the library does not know it (it always does once made). */
  path: string | null;
  /** Made by this call, rather than found. */
  made: boolean;
}

/** One copy at a time per app, collection and built-in: two notes asking at once get the same copy. */
const making = new WeakMap<App, Map<string, Promise<OwnCopy>>>();

async function makeOwnCopy(app: App, collectionId: string, builtInId: TemplateId): Promise<OwnCopy> {
  const assets = AssetService.getInstance(app);
  const settings = assets.getCollectionSettings(collectionId);
  const found = ownCopyOf(settings, TemplateLibrary.forApp(app), builtInId);
  if (found) return { id: found.template.id, path: found.path, made: false };
  const copy = await copyTemplate(app, builtInId);
  await assets.updateCollectionSettings(collectionId, withOwnCopy(assets.getCollectionSettings(collectionId), builtInId, copy.id));
  return { id: copy.id, path: copy.path, made: true };
}

/** The collection's copy of a built-in: the recorded one, else a new one, recorded. */
export function ensureOwnCopy(app: App, collectionId: string, builtInId: TemplateId): Promise<OwnCopy> {
  const running = making.get(app) ?? new Map<string, Promise<OwnCopy>>();
  making.set(app, running);
  const key = `${collectionId}\u0000${builtInId}`;
  const pending = running.get(key);
  if (pending) return pending;
  const made = makeOwnCopy(app, collectionId, builtInId).finally(() => running.delete(key));
  running.set(key, made);
  return made;
}

/** Forgets a copy this collection recorded (its making was undone): the next change makes a new one. */
export async function forgetOwnCopy(app: App, collectionId: string, builtInId: TemplateId, copyId: TemplateId): Promise<void> {
  const assets = AssetService.getInstance(app);
  const copies = assets.getCollectionSettings(collectionId).templateCopies;
  if (copies?.[builtInId] !== copyId) return;
  const { [builtInId]: _gone, ...rest } = copies;
  await assets.updateCollectionSettings(collectionId, { templateCopies: rest });
}
