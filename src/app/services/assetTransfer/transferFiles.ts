import { TFile, type App } from 'obsidian';
import { ensureFolder } from '../../plugin/vaultFolders';
import { moveSceneSnapshots } from '../../snapshots/snapshotFolderSync';
import { ensureHiddenFolder, isHiddenVaultPath, readVaultBinary, trashHiddenPath } from '../../utils/hiddenVaultFiles';
import { parentPath } from '../../utils/pathUtils';

type JournalEntry =
  | { kind: 'created'; path: string }
  | { kind: 'moved'; from: string; to: string }
  | { kind: 'snapshots'; fromMap: string; toMap: string }
  | { kind: 'rewritten'; path: string; original: string };

/**
 * The file operations of one transfer, recorded so that `undo` can take them
 * back while the asset records are not saved yet. Moves go through Obsidian's
 * file manager, so links, open maps and every other Atlas reference follow.
 */
export class TransferFiles {
  private readonly journal: JournalEntry[] = [];

  constructor(private readonly app: App) {}

  /** Writes `transform` of the file at `from` to the new file `to`; hidden paths go through the adapter. */
  async copy(from: string, to: string, transform: (raw: ArrayBuffer) => ArrayBuffer): Promise<void> {
    const raw = await readVaultBinary(this.app, from);
    if (!raw) return;
    const content = transform(raw);
    if (isHiddenVaultPath(to)) {
      await ensureHiddenFolder(this.app, parentPath(to));
      await this.app.vault.adapter.writeBinary(to, content);
    } else {
      await ensureFolder(this.app, parentPath(to));
      await this.app.vault.createBinary(to, content);
    }
    this.journal.push({ kind: 'created', path: to });
  }

  async move(from: string, to: string): Promise<void> {
    if (await this.rename(from, to)) this.journal.push({ kind: 'moved', from, to });
  }

  /** Moves a scene's snapshot folder ahead of its map, so the map's rename finds nothing left to move. */
  async moveSnapshots(fromMap: string, toMap: string): Promise<void> {
    await moveSceneSnapshots(this.app, fromMap, toMap);
    this.journal.push({ kind: 'snapshots', fromMap, toMap });
  }

  /** Writes `content` to the vault file at `path`, creating it when missing. */
  async write(path: string, content: string): Promise<void> {
    if (this.app.vault.getAbstractFileByPath(path) instanceof TFile) {
      await this.rewrite(path, (current) => (current === content ? null : content));
      return;
    }
    await ensureFolder(this.app, parentPath(path));
    await this.app.vault.create(path, content);
    this.journal.push({ kind: 'created', path });
  }

  /** Replaces the text of the file at `path` (hidden or not) with `rewrite` of it, unless that returns null. */
  async rewrite(path: string, rewrite: (content: string) => string | null): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const original = await this.app.vault.read(file);
      if (rewrite(original) === null) return;
      await this.app.vault.process(file, (latest) => rewrite(latest) ?? latest);
      this.journal.push({ kind: 'rewritten', path, original });
      return;
    }
    if (!isHiddenVaultPath(path) || !(await this.app.vault.adapter.exists(path))) return;
    const original = await this.app.vault.adapter.read(path);
    const content = rewrite(original);
    if (content === null) return;
    await this.app.vault.adapter.write(path, content);
    this.journal.push({ kind: 'rewritten', path, original });
  }

  /** Takes every recorded operation back, newest first; returns the paths that could not be restored. */
  async undo(): Promise<string[]> {
    const failed: string[] = [];
    for (const entry of this.journal.splice(0).reverse()) {
      try {
        await this.undoEntry(entry);
      } catch (error) {
        console.error('[TransferFiles] Could not undo', entry, error);
        failed.push(entry.kind === 'snapshots' ? entry.fromMap : entry.kind === 'moved' ? entry.from : entry.path);
      }
    }
    return failed;
  }

  private async rename(from: string, to: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(from);
    if (!(file instanceof TFile)) return false;
    await ensureFolder(this.app, parentPath(to));
    await this.app.fileManager.renameFile(file, to);
    return true;
  }

  private async undoEntry(entry: JournalEntry): Promise<void> {
    switch (entry.kind) {
      case 'created': {
        const file = this.app.vault.getAbstractFileByPath(entry.path);
        if (file instanceof TFile) await this.app.fileManager.trashFile(file);
        else await trashHiddenPath(this.app, entry.path);
        return;
      }
      case 'moved':
        await this.rename(entry.to, entry.from);
        return;
      case 'snapshots':
        await moveSceneSnapshots(this.app, entry.toMap, entry.fromMap);
        return;
      case 'rewritten': {
        const file = this.app.vault.getAbstractFileByPath(entry.path);
        if (file instanceof TFile) await this.app.vault.process(file, () => entry.original);
        else await this.app.vault.adapter.write(entry.path, entry.original);
      }
    }
  }
}
