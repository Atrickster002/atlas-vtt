import { TAbstractFile, TFile, type App, type EventRef } from 'obsidian';
import {
  freeRecordPath,
  isNamedAfter,
  isRecordPath,
  isWithin,
  readRecordText,
  recordText,
  type RecordFolderSpec,
  type StoredRecord,
} from './recordFolder';

interface RecordFile {
  text: string;
  /** Null for a file that holds no record (broken JSON, no id). */
  record: StoredRecord | null;
}

const folderOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/**
 * A folder of library records as vault files (`recordFolder.ts`), one per record, so they sync
 * and travel like any other file. It follows creates, edits, deletes and renames (a sync
 * delivering another device's change), recognises its own writes by their text and tells its
 * listeners about every change. Where two files hold one id (a conflict copy) the lower path
 * holds it. Edits are taken in at once and written in order in the background (`flush`).
 */
export class RecordFolderFiles {
  private readonly files = new Map<string, RecordFile>();
  /** Raised for a path whenever an event makes a read of it under way stale. */
  private readonly versions = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly refs: EventRef[] = [];
  private cache: StoredRecord[] | null = null;
  private writes: Promise<void> = Promise.resolve();
  private loading: Promise<void> | null = null;

  constructor(protected readonly app: App, private readonly spec: RecordFolderSpec) {
    const { vault } = app;
    this.refs.push(
      vault.on('create', (file) => this.written(file)),
      vault.on('modify', (file) => this.written(file)),
      vault.on('delete', (file) => this.deleted(file.path)),
      vault.on('rename', (file, oldPath) => this.renamed(file, oldPath)),
    );
  }

  /** Reads the folder once, through the adapter, which does not wait for the vault's index. */
  load(): Promise<void> {
    return (this.loading ??= this.readFolder(this.spec.folder));
  }

  /** The stored records, the first file per id by path; the same array while nothing changed. */
  entries(): readonly StoredRecord[] {
    if (this.cache) return this.cache;
    const seen = new Set<string>();
    this.cache = [...this.files.keys()].sort().flatMap((path) => {
      const record = this.files.get(path)?.record;
      if (!record || seen.has(record.id)) return [];
      seen.add(record.id);
      return [record];
    });
    return this.cache;
  }

  /** The file that holds the record `id`, or null when none does. */
  pathOf(id: string): string | null {
    return [...this.files.keys()].sort().find((path) => this.files.get(path)?.record?.id === id) ?? null;
  }

  /**
   * Writes a new record file. `apart` names it with a piece of its id: devices that carry their
   * records over at once could otherwise each write a file of the same name, of which sync keeps
   * one. Its next edit gives it the plain name when that is free.
   */
  create(entry: StoredRecord, apart = false): void {
    const name = apart ? `${typeof entry.name === 'string' ? entry.name : ''} (${entry.id.slice(-6)})` : entry.name;
    const path = freeRecordPath(this.spec, name, (candidate) => this.isTaken(candidate));
    this.bump(path);
    this.files.set(path, { text: recordText(this.spec, entry), record: entry });
    this.changed();
    this.enqueue(() => this.writeNew(entry.id));
  }

  /** Changes the record; on disk the change is applied to what the file holds then, so a field another device wrote survives. */
  update(id: string, change: (stored: StoredRecord) => StoredRecord): void {
    const path = this.pathOf(id);
    const record = path ? this.files.get(path)?.record : null;
    if (!path || !record) throw new Error(`No ${this.spec.noun} file holds ${id}`);
    const next = change(record);
    this.bump(path);
    this.files.set(path, { text: recordText(this.spec, next), record: next });
    this.changed();
    this.enqueue(() => this.writeChange(id, change));
  }

  /** Removes every file that holds the record, conflict copies included, so none brings it back. */
  remove(id: string): void {
    const paths = [...this.files.keys()].filter((path) => this.files.get(path)?.record?.id === id);
    if (paths.length === 0) return;
    for (const path of paths) this.files.delete(path);
    this.changed();
    this.enqueue(async () => {
      for (const path of paths) {
        const file = this.app.vault.getFileByPath(path);
        if (file) await this.app.fileManager.trashFile(file);
      }
    });
  }

  /**
   * Text another part of Atlas has just written to a record file (a collection import), taken in
   * without waiting for the vault's event, which then finds it known.
   */
  recordWrite(path: string, text: string): void {
    if (!isRecordPath(this.spec, path) || this.files.get(path)?.text === text) return;
    this.bump(path);
    this.files.set(path, { text, record: readRecordText(this.spec, text) });
    this.changed();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Settles once every edit made so far is on disk. */
  flush(): Promise<void> {
    return this.writes;
  }

  destroy(): void {
    for (const ref of this.refs.splice(0)) this.app.vault.offref(ref);
    this.listeners.clear();
  }

  private enqueue(write: () => Promise<void>): void {
    this.writes = this.writes.then(write).catch((error: unknown) => {
      console.error(`[Atlas] Writing a ${this.spec.noun} file failed:`, error);
    });
  }

  private async writeNew(id: string): Promise<void> {
    let path = this.pathOf(id);
    const entry = path ? this.files.get(path) : undefined;
    if (!path || !entry) return;
    const { vault } = this.app;
    if (vault.getAbstractFileByPath(path)) {
      // Another file took the name meanwhile (a sync); this one takes the next free name.
      this.files.delete(path);
      path = freeRecordPath(this.spec, entry.record?.name, (candidate) => this.isTaken(candidate));
      this.files.set(path, entry);
    }
    if (!vault.getFolderByPath(this.spec.folder)) await vault.createFolder(this.spec.folder).catch(() => undefined);
    await vault.create(path, entry.text);
  }

  private async writeChange(id: string, change: (stored: StoredRecord) => StoredRecord): Promise<void> {
    const path = this.pathOf(id);
    const file = path ? this.app.vault.getFileByPath(path) : null;
    if (!path || !file) return;
    let written = '';
    await this.app.vault.process(file, (text) => {
      const onDisk = readRecordText(this.spec, text);
      // A file that no longer holds the record is left as it is.
      written = onDisk?.id === id ? recordText(this.spec, change(onDisk)) : text;
      return written;
    });
    if (this.files.get(path)?.text !== written) {
      this.files.set(path, { text: written, record: readRecordText(this.spec, written) });
      this.changed();
    }
    await this.followName(id, file);
  }

  /** A renamed record's file takes the new name. */
  private async followName(id: string, file: TFile): Promise<void> {
    const path = file.path;
    const name = this.files.get(path)?.record?.name;
    if (this.pathOf(id) !== path || isNamedAfter(this.spec, path, name)) return;
    const target = freeRecordPath(this.spec, name, (candidate) => this.isTaken(candidate, path));
    if (target === path) return;
    await this.app.fileManager.renameFile(file, target);
    this.move(path, target);
  }

  private isTaken(path: string, except: string | null = null): boolean {
    const lower = path.toLowerCase();
    if (except !== null && except.toLowerCase() === lower) return false;
    if ([...this.files.keys()].some((known) => known.toLowerCase() === lower)) return true;
    if (this.app.vault.getAbstractFileByPath(path)) return true;
    const siblings = this.app.vault.getFolderByPath(folderOf(path))?.children ?? [];
    return siblings.some((child) => child.path.toLowerCase() === lower);
  }

  private async readFolder(folder: string): Promise<void> {
    const { adapter } = this.app.vault;
    if (!(await adapter.exists(folder))) return;
    const listed = await adapter.list(folder);
    for (const path of listed.files) if (isRecordPath(this.spec, path)) await this.read(path, () => adapter.read(path));
    for (const child of listed.folders) await this.readFolder(child);
  }

  private written(file: TAbstractFile): void {
    if (!(file instanceof TFile) || !isRecordPath(this.spec, file.path)) return;
    void this.read(file.path, () => this.app.vault.read(file));
  }

  private async read(path: string, text: () => Promise<string>): Promise<void> {
    const version = this.bump(path);
    let read: string;
    try {
      read = await text();
    } catch (error) {
      console.error(`[Atlas] Could not read the ${this.spec.noun} ${path}:`, error);
      return;
    }
    if (this.versions.get(path) !== version || this.files.get(path)?.text === read) return;
    this.files.set(path, { text: read, record: readRecordText(this.spec, read) });
    this.changed();
  }

  private deleted(path: string): void {
    const gone = [...this.files.keys()].filter((known) => isWithin(known, path));
    for (const known of gone) {
      this.bump(known);
      this.files.delete(known);
    }
    if (gone.length > 0) this.changed();
  }

  /** Files move without being read again; a file moved into the folder from elsewhere is read. */
  private renamed(file: TAbstractFile, oldPath: string): void {
    const moved = [...this.files.keys()].filter((known) => isWithin(known, oldPath));
    for (const known of moved) this.move(known, file.path + known.slice(oldPath.length));
    const arrived = file instanceof TFile ? [file] : this.app.vault.getFiles().filter((child) => isWithin(child.path, file.path));
    for (const child of arrived) if (!this.files.has(child.path)) this.written(child);
  }

  private move(from: string, to: string): void {
    const entry = this.files.get(from);
    if (!entry) return;
    this.bump(from);
    this.files.delete(from);
    if (isRecordPath(this.spec, to)) this.files.set(to, entry);
    this.changed();
  }

  private bump(path: string): number {
    const version = (this.versions.get(path) ?? 0) + 1;
    this.versions.set(path, version);
    return version;
  }

  private changed(): void {
    this.cache = null;
    for (const listener of [...this.listeners]) listener();
  }
}
