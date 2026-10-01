import { mapResources } from '../resources/collectionResources';
import { AssetService } from './AssetService';
import type { App } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { InitiativeEntry } from '../types/initiativeTypes';
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
}

/** Read-only initiative projection; never mounts the DM tracker or its controls. */
export class PlayerInitiativePanel extends PlayerSceneOverlay<InitiativeScene> {
  constructor(private readonly app: App, settings: SettingsService) {
    super({ cls: 'atlas-player-initiative-container' }, settings);
  }

  protected select({ initiative, initiativeTrackerOpen, objects, mapPath }: ViewAtlasState): InitiativeScene {
    const tokens = objects?.tokens;
    const visibleTokenIds = (initiative?.entries ?? [])
      .filter((entry) => tokens?.[entry.tokenId] && !tokens[entry.tokenId]?.isHidden)
      .map((entry) => entry.tokenId)
      .join(TOKEN_ID_SEPARATOR);
    return { initiative, initiativeTrackerOpen, visibleTokenIds, mapPath: mapPath ?? null };
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
    for (const entry of entries) this.renderEntry(list, entry, settings, initiative.isActive, hpVisible);
    if (initiative.isActive) {
      panel.createDiv({ cls: 'atlas-player-initiative__round', text: `Round ${initiative.round}` });
    }
  }

  private renderEntry(parent: HTMLElement, entry: InitiativeEntry, settings: PlayerSettings, combatActive: boolean, hpVisible: boolean): void {
    const card = parent.createDiv({ cls: 'atlas-player-initiative__card', attr: { role: 'listitem' } });
    if (combatActive && entry.isActive) {
      card.addClass('atlas-player-initiative__card--active');
      card.setAttribute('aria-current', 'true');
    }
    if (entry.imagePath) {
      const src = /^(?:https?:|data:|blob:|app:)/.test(entry.imagePath)
        ? entry.imagePath : this.app.vault.adapter.getResourcePath(entry.imagePath);
      card.createEl('img', {
        cls: 'atlas-player-initiative__avatar',
        attr: { src, alt: settings.showTokenNameplates ? entry.name : '' },
      });
    }
    card.createSpan({ cls: 'atlas-player-initiative__value', text: String(entry.initiative) });
    if (settings.showTokenNameplates) {
      card.createSpan({ cls: 'atlas-player-initiative__name', text: entry.name });
    }
    if (hpVisible && entry.hp.max > 0) {
      card.createEl('progress', {
        cls: 'atlas-player-initiative__hp',
        attr: { max: entry.hp.max, value: Math.max(0, entry.hp.current), 'aria-label': 'HP' },
      });
    }
  }
}
