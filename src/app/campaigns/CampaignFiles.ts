import type { App } from 'obsidian';
import { RecordFiles } from '../services/recordFiles/RecordFiles';
import { CAMPAIGN_LAYOUT } from './campaignPaths';
import type { StoredCampaign } from './campaignTypes';
import { campaignName } from './campaignValidation';

/** Hears that this device renamed a campaign, from the name it bore to the one it bears now. */
export type CampaignRenameListener = (id: string, from: string, to: string) => void;

/** Where campaigns are kept: their files in the vault (`CampaignFiles`), or memory in tests. */
export interface CampaignStorage {
  /** The campaigns as stored, unvalidated; the same array while nothing changed. */
  entries(): readonly StoredCampaign[];
  create(entry: StoredCampaign): void;
  /** Changes the stored campaign `id` with `change`, which gets the campaign as stored. */
  update(id: string, change: (stored: StoredCampaign) => StoredCampaign): void;
  remove(id: string): void;
  /** The file that holds the campaign `id`, or null when none does. */
  pathOf(id: string): string | null;
  /** Calls `listener` after every change, also one that arrived from another device. */
  onChange(listener: () => void): () => void;
}

/**
 * The vault's campaigns as their files (`RecordFiles` with the campaign layout): a folder per
 * campaign, renamed with it, trashed whole when it is deleted. One per app, opened by the plugin
 * and released when it unloads.
 */
export class CampaignFiles extends RecordFiles<StoredCampaign> implements CampaignStorage {
  private static readonly instances = new WeakMap<App, CampaignFiles>();

  static open(app: App): CampaignFiles {
    let files = CampaignFiles.instances.get(app);
    if (!files) {
      files = new CampaignFiles(app);
      CampaignFiles.instances.set(app, files);
    }
    return files;
  }

  /** The app's campaigns once the plugin opened them; undefined before. */
  static forApp(app: App | undefined): CampaignFiles | undefined {
    return app ? CampaignFiles.instances.get(app) : undefined;
  }

  static release(app: App): void {
    CampaignFiles.instances.get(app)?.destroy();
    CampaignFiles.instances.delete(app);
  }

  private readonly renameListeners = new Set<CampaignRenameListener>();

  private constructor(app: App) {
    super(app, CAMPAIGN_LAYOUT);
  }

  /** Tells the rename listeners of an edit that renamed the campaign; only this device's edits pass here. */
  override update(id: string, change: (stored: StoredCampaign) => StoredCampaign): void {
    const before = this.nameOf(id);
    super.update(id, change);
    const after = this.nameOf(id);
    if (before === null || after === null || before === after) return;
    for (const listener of [...this.renameListeners]) listener(id, before, after);
  }

  /**
   * Calls `listener` whenever this device renames a campaign, at once, before its folder takes the
   * new name; another device's rename arrives as its file and is not told. Returns what stops it.
   */
  onRename(listener: CampaignRenameListener): () => void {
    this.renameListeners.add(listener);
    return () => { this.renameListeners.delete(listener); };
  }

  override destroy(): void {
    this.renameListeners.clear();
    super.destroy();
  }

  private nameOf(id: string): string | null {
    return campaignName(this.entries().find((entry) => entry.id === id)?.name);
  }
}
