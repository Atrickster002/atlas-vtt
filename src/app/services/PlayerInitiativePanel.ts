import type { ResourceValue } from '../resources/resourceTypes';
import { mapResources } from '../resources/collectionResources';
import { AssetService } from './AssetService';
import type { App } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { createTokenPortrait } from '../packages/components/shared/tokenPortraitElement';
import { PlayerSceneOverlay, type PlayerSettings } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';
import './player-initiative.scss';

/** Separates token ids in `InitiativeScene.visibleTokenIds`. */
const TOKEN_ID_SEPARATOR = '\n';

interface InitiativeScene {
  initiative: ViewAtlasState['initiative'];
  initiativeTrackerOpen: boolean;
  /** Initiative tokens players may see, joined into a key so edits to other tokens compare equal. */
  visibleTokenIds: string;
  mapPath: string | null;
  /** The HP of every initiative token, in entry order, as a key that changes when one of them does. */
  hp: string;
  /** Whether each initiative token has a ring, and its colour, in entry order, as such a key. */
  rings: string;
}

/** A token's ring as the list draws it; the map frames a token unless its ring is switched off. */
interface TokenRing {
  showRing: boolean;
  ringColor?: string | undefined;
}

/** Read-only initiative projection; never mounts the DM tracker or its controls. */
export class PlayerInitiativePanel extends PlayerSceneOverlay<InitiativeScene> {
  constructor(private readonly app: App, settings: SettingsService) {
    super({ cls: 'atlas-player-initiative-container' }, settings);
  }

  protected select({ initiative, initiativeTrackerOpen, objects, mapPath }: ViewAtlasState): InitiativeScene {
    const tokens = objects?.tokens;
    const entries = initiative?.entries ?? [];
    const visibleTokenIds = entries
      .filter((entry) => tokens?.[entry.tokenId] && !tokens[entry.tokenId]?.isHidden)
      .map((entry) => entry.tokenId)
      .join(TOKEN_ID_SEPARATOR);
    const hp = JSON.stringify(entries.map((entry) => tokens?.[entry.tokenId]?.resources?.hp ?? null));
    const rings = JSON.stringify(entries.map((entry): TokenRing => {
      const token = tokens?.[entry.tokenId];
      return { showRing: token?.showRing !== false, ringColor: token?.ringColor };
    }));
    return { initiative, initiativeTrackerOpen, visibleTokenIds, mapPath: mapPath ?? null, hp, rings };
  }

  protected render(container: HTMLElement, scene: InitiativeScene, settings: PlayerSettings): void {
    const { initiative, initiativeTrackerOpen } = scene;
    if (!settings.showInitiative || !initiativeTrackerOpen || !initiative) return;
    const visibleTokenIds = new Set(scene.visibleTokenIds.split(TOKEN_ID_SEPARATOR));
    const entries = initiative.entries
      .filter(entry => visibleTokenIds.has(entry.tokenId))
      .sort((a, b) => a.order - b.order);
    if (!entries.length) return;

    const panel = container.createDiv({
      cls: 'atlas-player-initiative',
      attr: { role: 'region', 'aria-label': 'Initiative order' },
    });
    const list = panel.createDiv({ cls: 'atlas-player-initiative__list', attr: { role: 'list' } });
    // Players see HP where the map's collection shows it to them
    const hpVisible = mapResources(AssetService.getInstance(this.app), scene.mapPath).some((definition) => definition.key === 'hp' && definition.visibleToPlayers);
    const hpOf = JSON.parse(scene.hp) as Array<ResourceValue | null>;
    const ringOf = JSON.parse(scene.rings) as TokenRing[];
    for (const entry of entries) {
      const index = initiative.entries.indexOf(entry);
      const hp = hpVisible ? hpOf[index] ?? null : null;
      this.renderEntry(list, entry, settings, initiative.isActive, hp, ringOf[index] ?? { showRing: true });
    }
    if (initiative.isActive) {
      panel.createDiv({ cls: 'atlas-player-initiative__round', text: `Round ${initiative.round}` });
    }
  }

  private renderEntry(parent: HTMLElement, entry: InitiativeEntry, settings: PlayerSettings, combatActive: boolean, hp: ResourceValue | null, ring: TokenRing): void {
    const card = parent.createDiv({ cls: 'atlas-player-initiative__card', attr: { role: 'listitem' } });
    if (combatActive && entry.isActive) {
      card.addClass('atlas-player-initiative__card--active');
      card.setAttribute('aria-current', 'true');
    }
    if (entry.imagePath) {
      const src = /^(?:https?:|data:|blob:|app:)/.test(entry.imagePath)
        ? entry.imagePath : this.app.vault.adapter.getResourcePath(entry.imagePath);
      createTokenPortrait(card, { src, alt: settings.showTokenNameplates ? entry.name : '', cls: 'atlas-player-initiative__avatar', ...ring });
    }
    card.createSpan({ cls: 'atlas-player-initiative__value', text: String(entry.initiative) });
    if (settings.showTokenNameplates) {
      card.createSpan({ cls: 'atlas-player-initiative__name', text: entry.name });
    }
    if (hp && hp.max > 0) {
      card.createEl('progress', {
        cls: 'atlas-player-initiative__hp',
        attr: { max: hp.max, value: Math.max(0, hp.current), 'aria-label': 'HP' },
      });
    }
  }
}
