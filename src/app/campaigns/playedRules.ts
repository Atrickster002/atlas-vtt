import type { App } from 'obsidian';
import type { PlayedSystem } from '../gameSystems/mapRules';
import { CampaignPlay } from './campaignPlay';

/**
 * The game system of the campaign this device plays, which every map then plays by. One per app,
 * opened by the plugin and released when it unloads; readers ask
 * `forApp`, which has none before.
 */
export class PlayedRules {
  private static readonly instances = new WeakMap<object, PlayedRules>();

  static open(app: App, play: CampaignPlay = CampaignPlay.forApp(app)): PlayedRules {
    let rules = PlayedRules.instances.get(app);
    if (!rules) {
      rules = new PlayedRules(play);
      PlayedRules.instances.set(app, rules);
    }
    return rules;
  }

  /** The app's played rules once the plugin opened them; undefined before. */
  static forApp(app: object | undefined): PlayedRules | undefined {
    return app ? PlayedRules.instances.get(app) : undefined;
  }

  static release(app: App): void {
    PlayedRules.instances.get(app)?.destroy();
    PlayedRules.instances.delete(app);
  }

  private readonly listeners = new Set<() => void>();

  private constructor(private readonly play: CampaignPlay) {}

  /** The id of the campaign being played, or null. */
  campaignId(): string | null {
    return this.play.playing();
  }

  /** The played campaign's system, or null. Campaigns keep no system yet. */
  played(): PlayedSystem | null {
    return null;
  }

  /** Calls `listener` whenever `played` gives another system; returns the function that stops it. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  destroy(): void {
    this.listeners.clear();
  }
}
