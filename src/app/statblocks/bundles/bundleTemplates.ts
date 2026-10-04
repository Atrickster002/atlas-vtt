/**
 * Statblock templates in collection bundles (§4.3, §6.5): the templates an export carries, the
 * text it packs (code stripped), what an import reads from a bundle (code dropped again) and the
 * vault's own templates by id. Templates are compared by a fingerprint of their content without
 * their id, so a copy under another id is the same template.
 */

import { TFile, type App } from 'obsidian';
import { NOTE_FILE_ROLES, TEMPLATE_ROLE, type BundleFile } from '../../services/collectionBundle/bundleFormat';
import { templateFingerprint } from '../../services/collectionBundle/fingerprints';
import type { InstalledTemplate } from '../../services/collectionBundle/installRecord';
import { isRecord, parseJsonText } from '../format/jsonValues';
import { migrateTemplate } from '../format/migrateTemplate';
import { withCoreSlots } from '../model/coreSlots';
import { parseTemplate } from '../format/parseTemplate';
import { flushTemplateSessions } from '../library/sessionRegistry';
import { TEMPLATE_EXTENSION, indexTemplateFiles, readTemplateFile, templateName } from '../library/templateFiles';
import { findCode, stripCode } from '../model/fsCodeKeys';
import type { LibraryTemplate } from '../model/resolvedTypes';
import { isBuiltInTemplateId, type TemplateId } from '../model/templateTypes';
import { cachedTemplateId } from '../notes/statblockSource';

/** A template as a bundle carries it: without code, read and fingerprinted. */
export interface PackedTemplate {
  /** Its file's path in the bundle (or the vault, when packing). */
  path: string;
  /** The file's basename, the template's name. */
  name: string;
  id: TemplateId;
  /** The file's own text when it held no code, else the JSON without it. */
  text: string;
  json: Record<string, unknown>;
  fingerprint: string;
  /** As the library would hold it, for previews of the bundle's notes. */
  entry: LibraryTemplate;
}

/** A template file of the vault, by the id it holds. */
export interface VaultTemplate {
  id: TemplateId;
  path: string;
  fingerprint: string;
}

function parseJson(text: string): unknown {
  const parsed = parseJsonText(text);
  return 'value' in parsed ? parsed.value : undefined;
}

/**
 * A template file's text without code: every `script` block and code-bearing key is removed
 * (§6.5). Null for text that is no template a vault may hold: not JSON, unreadable as a
 * template, or claiming a built-in's id.
 */
export async function cleanTemplate(path: string, text: string): Promise<PackedTemplate | null> {
  const value = parseJson(text);
  if (!isRecord(value)) return null;
  const hasCode = findCode(value).length > 0;
  const json = hasCode ? stripCode(value) : value;
  if (!isRecord(json)) return null;
  const result = parseTemplate(json);
  if (!result.template || (result.status !== 'ok' && result.status !== 'newer')) return null;
  const name = templateName(path);
  return {
    path,
    name,
    id: result.template.id,
    text: hasCode ? `${JSON.stringify(json, null, 2)}\n` : text,
    json,
    fingerprint: await templateFingerprint(json),
    entry: { template: withCoreSlots(migrateTemplate(result.template)), name, status: result.status, builtIn: false, path },
  };
}

/**
 * A vault template file as an export packs it, and what the publisher's install record keeps
 * of it: the vault's file as it is installed, the packed one as its source. Null for a file
 * that is no template.
 */
export async function packTemplateFile(path: string, content: ArrayBuffer): Promise<{ text: string; installed: InstalledTemplate } | null> {
  const text = new TextDecoder().decode(content);
  const packed = await cleanTemplate(path, text);
  const own = parseJson(text);
  if (!packed || !isRecord(own)) return null;
  const installed = { localId: packed.id, target: path, source: packed.fingerprint, installed: await templateFingerprint(own) };
  return { text: packed.text, installed };
}

/** The templates a bundle carries, code dropped; the first file of an id holds it, and a file that is no template is left out. */
export async function readBundleTemplates(files: readonly BundleFile[], read: (path: string) => Promise<string | null>): Promise<PackedTemplate[]> {
  const templates = new Map<TemplateId, PackedTemplate>();
  for (const file of files) {
    if (file.role !== TEMPLATE_ROLE) continue;
    const text = await read(file.vaultPath);
    const template = text === null ? null : await cleanTemplate(file.vaultPath, text);
    if (template && !templates.has(template.id)) templates.set(template.id, template);
  }
  return [...templates.values()];
}

/** Writes the edits open template editors hold, so the files are what the user sees; a session that cannot write leaves its file as it is. */
export async function flushTemplateEdits(app: App): Promise<void> {
  try {
    await flushTemplateSessions(app);
  } catch (error) {
    console.error('[bundleTemplates] Could not write pending template edits:', error);
  }
}

/**
 * The vault's templates by id, read from their files now (the library reads in the background
 * and may not have every file yet), once open template editors have written their edits.
 * Where several files claim one id, the lowest path holds it, as in the library.
 */
export async function vaultTemplates(app: App): Promise<Map<TemplateId, VaultTemplate>> {
  await flushTemplateEdits(app);
  const files = [];
  for (const file of app.vault.getFiles()) {
    if (file.extension === TEMPLATE_EXTENSION) files.push(readTemplateFile(file.path, await app.vault.read(file)));
  }
  const texts = new Map(files.map((file) => [file.path, file.text]));
  const templates = new Map<TemplateId, VaultTemplate>();
  for (const [id, entry] of indexTemplateFiles(files).byId) {
    const json = entry.path === null ? undefined : parseJson(texts.get(entry.path) ?? '');
    if (entry.path !== null && isRecord(json)) templates.set(id, { id, path: entry.path, fingerprint: await templateFingerprint(json) });
  }
  return templates;
}

/** The fingerprint of the template file at `path`; null when there is none. */
export async function templateFingerprintAt(app: App, path: string): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const json = parseJson(await app.vault.read(file));
  return isRecord(json) ? templateFingerprint(json) : null;
}

/** The template a vault note names in its frontmatter, from the metadata cache; null for any other note. */
export function noteTemplateId(app: App, path: string): TemplateId | null {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? cachedTemplateId(app, file) : null;
}

/**
 * `files` with the template files the collection's roles (`roleTemplates`) and its notes name.
 * A template a role names travels with the collection; one only notes name travels with those
 * notes (`linkedFrom`), so it stays behind with them. Built-ins never travel: every Atlas has
 * them. A template the vault lacks stays behind too: what names it shows the auto template.
 */
export async function withTemplateFiles(app: App, files: readonly BundleFile[], roleTemplates: readonly TemplateId[]): Promise<BundleFile[]> {
  // Notes per template; null for a template a role names.
  const namedBy = new Map<TemplateId, string[] | null>(roleTemplates.map((id) => [id, null]));
  for (const file of files) {
    const id = NOTE_FILE_ROLES.has(file.role) ? noteTemplateId(app, file.vaultPath) : null;
    const notes = id === null ? null : namedBy.get(id);
    if (id !== null && notes !== null) namedBy.set(id, [...(notes ?? []), file.vaultPath]);
  }
  const wanted = [...namedBy.keys()].filter((id) => !isBuiltInTemplateId(id));
  if (wanted.length === 0) return [...files];
  const vault = await vaultTemplates(app);
  const known = new Set(files.map((file) => file.vaultPath));
  const templates = wanted.flatMap((id): BundleFile[] => {
    const path = vault.get(id)?.path;
    if (path === undefined || known.has(path)) return [];
    known.add(path);
    const notes = namedBy.get(id);
    return [{ vaultPath: path, role: TEMPLATE_ROLE, ...(notes && { linkedFrom: notes }) }];
  });
  return [...files, ...templates];
}
