import type { App } from 'obsidian';
import { isAssetId } from './campaignValues';

const STORAGE_KEY = 'atlas-vtt:playing-campaign';

type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

/**
 * The campaign this device is playing, or none. Which campaign a table plays is a fact about this
 * device, never about the vault, so it is kept in the vault's local storage and never synced.
 */
export class CampaignPlay {
  private static readonly instances = new WeakMap<DeviceStorage, CampaignPlay>();

  static forApp(app: DeviceStorage): CampaignPlay {
    let play = CampaignPlay.instances.get(app);
    if (!play) {
      play = new CampaignPlay(app);
      CampaignPlay.instances.set(app, play);
    }
    return play;
  }

  private id: string | null;
  private readonly listeners = new Set<() => void>();

  private constructor(private readonly storage: DeviceStorage) {
    // Trust boundary: local storage may hold another version's value, or nothing.
    const stored: unknown = storage.loadLocalStorage(STORAGE_KEY);
    this.id = isAssetId(stored) ? stored : null;
  }

  /** The id of the campaign being played, or null. */
  playing(): string | null {
    return this.id;
  }

  /** Plays the campaign `id`, in place of any other. */
  play(id: string): void {
    this.set(id);
  }

  stop(): void {
    this.set(null);
  }

  /** Calls `listener` whenever another campaign, or none, is being played. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private set(id: string | null): void {
    if (id === this.id) return;
    this.id = id;
    this.storage.saveLocalStorage(STORAGE_KEY, id);
    for (const listener of [...this.listeners]) listener();
  }
}
