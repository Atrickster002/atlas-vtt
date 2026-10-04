/**
 * What else reads a template field's key (§8.8): the token resources whose
 * statblock field names it (`hp`, or a part of it such as `hp.max`) and the
 * custom creature filters on it, in the collections the template's statblocks
 * are used in. A rename can update them with the notes.
 */

import type { App } from 'obsidian';
import { collectionResources } from '../../resources/collectionResources';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import { AssetService, type CollectionMetadata } from '../../services/AssetService';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import type { CreatureFilterDefinition } from '../../types/creatureFilterTypes';
import type { FieldKey, TemplateId } from '../model/templateTypes';
import { templateUsage } from './templateUsage';

export interface KeyDependant {
  collectionId: string;
  collectionName: string;
  kind: 'resource' | 'filter';
  /** Its name in the collection: "Hit points", "CR". */
  name: string;
  /** The statblock field it reads: "hp", "hp.max". */
  field: string;
}

type DependantSettings = Pick<CollectionSettings, 'resources' | 'customCreatureFilters'>;

/** Whether a statblock field path reads the key: the key itself or a part of its value. */
export function readsKey(field: string, key: FieldKey): boolean {
  return field === key || field.startsWith(`${key}.`);
}

/** The path with the key renamed: "hp.max" for `hp` → `hit_points` is "hit_points.max". */
export function renamedPath(field: string, from: FieldKey, to: FieldKey): string {
  return readsKey(field, from) ? to + field.slice(from.length) : field;
}

function filterFields(filter: CreatureFilterDefinition): string[] {
  if (filter.kind === 'range') return typeof filter.field === 'string' ? [filter.field] : [];
  return Array.isArray(filter.fields) ? filter.fields.filter((field): field is string => typeof field === 'string') : [];
}

function storedFilters(settings: DependantSettings): CreatureFilterDefinition[] {
  return Array.isArray(settings.customCreatureFilters) ? settings.customCreatureFilters : [];
}

/** The resources and custom creature filters of one collection that read the key. */
export function dependantsIn(collection: CollectionMetadata, key: FieldKey): KeyDependant[] {
  const settings = collection.settings ?? { conditions: [] };
  const of = { collectionId: collection.id, collectionName: collection.name };
  const resources = collectionResources(settings)
    .filter((resource) => readsKey(resource.field, key))
    .map((resource): KeyDependant => ({ ...of, kind: 'resource', name: resource.name, field: resource.field }));
  const filters = storedFilters(settings).flatMap((filter) => filterFields(filter)
    .filter((field) => readsKey(field, key))
    .map((field): KeyDependant => ({ ...of, kind: 'filter', name: filter.label, field })));
  return [...resources, ...filters];
}

function renamedFilter(filter: CreatureFilterDefinition, from: FieldKey, to: FieldKey): CreatureFilterDefinition {
  if (!filterFields(filter).some((field) => readsKey(field, from))) return filter;
  return filter.kind === 'range'
    ? { ...filter, field: renamedPath(filter.field, from, to) }
    : { ...filter, fields: filter.fields.map((field) => renamedPath(field, from, to)) };
}

/**
 * The settings that make a collection's resources and custom filters read `to`
 * where they read `from`, or null where none does. Everything else in them,
 * and every entry that does not read the key, stays as it is.
 */
export function settingsWithRenamedKey(settings: DependantSettings & Pick<CollectionSettings, 'defaultWidgets' | 'systemPresetId'>, from: FieldKey, to: FieldKey): DependantSettings | null {
  const changes: DependantSettings = {};
  const resources = collectionResources(settings);
  if (resources.some((resource) => readsKey(resource.field, from))) {
    changes.resources = resources.map((resource): ResourceDefinition => (
      readsKey(resource.field, from) ? { ...resource, field: renamedPath(resource.field, from, to) } : resource));
  }
  const filters = storedFilters(settings);
  if (filters.some((filter) => filterFields(filter).some((field) => readsKey(field, from)))) {
    changes.customCreatureFilters = filters.map((filter) => renamedFilter(filter, from, to));
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * The collections a template's statblocks are used in: those whose roles start
 * from it, and those whose tokens link one of its notes. A resource elsewhere
 * that reads a key of the same name belongs to other statblocks.
 */
export async function collectionsUsingTemplate(app: App, templateId: TemplateId, notes: readonly string[]): Promise<CollectionMetadata[]> {
  const assets = AssetService.getInstance(app);
  const [collections, tokens] = await Promise.all([assets.getCollections(), assets.getAssets(undefined, 'token')]);
  const linked = new Set(notes);
  const using = new Set(templateUsage(app, templateId).roles.map((role) => role.collectionId));
  for (const token of tokens) if (token.statblockPath && linked.has(token.statblockPath)) using.add(token.collection);
  return collections.filter((collection) => using.has(collection.id));
}

/** The resources and filters that read the key, in the collections the template is used in. */
export async function keyDependants(app: App, templateId: TemplateId, key: FieldKey, notes: readonly string[]): Promise<KeyDependant[]> {
  const collections = await collectionsUsingTemplate(app, templateId, notes);
  return collections.flatMap((collection) => dependantsIn(collection, key));
}

/** Makes the dependants in these collections read `to`; one settings save per collection that has any. */
export async function updateKeyDependants(app: App, collectionIds: readonly string[], from: FieldKey, to: FieldKey): Promise<void> {
  const assets = AssetService.getInstance(app);
  for (const collectionId of new Set(collectionIds)) {
    const changes = settingsWithRenamedKey(assets.getCollectionSettings(collectionId), from, to);
    if (changes) await assets.updateCollectionSettings(collectionId, changes);
  }
}
