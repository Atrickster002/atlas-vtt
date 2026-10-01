import type { ResourceValue } from '../resources/resourceTypes';
import { mapResources } from '../resources/collectionResources';
import { AssetService } from './AssetService';
import type { App } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { InitiativeEntry } from '../types/initiativeTypes';
import type { TokenPerception } from '../pixi/lighting/playerLightingLayers';
import { PlayerSceneOverlay, type PlayerSettings } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';
import './player-initiative.scss';

/** Separates token ids in `InitiativeScene.visibleTokenIds` and `sensedTokenIds`. */
const TOKEN_ID_SEPARATOR = '\n';

interface InitiativeScene {
  initiative: ViewAtlasState['initiative'];
  initiativeTrackerOpen: boolean;
  /** Initiative tokens players may see, joined into a key so edits to other tokens compare equal. */
  visibleTokenIds: string;
  /** Those of them the players only sense: named, without portrait and resources. */
  sensedTokenIds: string;
  mapPath: string | null;
  /** The HP of every initiative token, in entry order, as a key that changes when one of them does. */
  hp: string;
}

/**
 * Read-only initiative projection; never mounts the DM tracker or its controls. Where the
 * players' tokens decide what is seen (`tokenSight`, the perception the canvas hides tokens by),
 * the list follows the map: a token they do not perceive has no entry, one they only sense is
 * named without its portrait and resources, and a token with vision, one of theirs, always shows.
 */
export class PlayerInitiativePanel extends PlayerSceneOverlay<InitiativeScene> {
  constructor(private readonly app: App, settings: SettingsService, private readonly tokenSight: () => TokenPerception | undefined = () => undefined) {
    super({ cls: 'atlas-player-initiative-container' }, settings);
  }

  sightChanged(): void {
    this.reselect();
  }

  protected select({ initiative, initiativeTrackerOpen, objects, mapPath }: ViewAtlasState): InitiativeScene {
    const tokens = objects?.tokens;
    const entries = initiative?.entries ?? [];
    const perception = this.tokenSight();
    const perceived = (tokenId: string): ReturnType<TokenPerception> => {
      const token = tokens?.[tokenId];
      if (!token || token.isHidden) return 'unseen';
      return !perception || token.vision?.enabled ? 'seen' : perception(tokenId);
    };
    const idsOf = (shown: (how: ReturnType<TokenPerception>) => boolean): string =>
      entries.filter((entry) => shown(perceived(entry.tokenId))).map((entry) => entry.tokenId).join(TOKEN_ID_SEPARATOR);
    const hp = JSON.stringify(entries.map((entry) => tokens?.[entry.tokenId]?.resources?.hp ?? null));
    return {
      initiative, initiativeTrackerOpen, mapPath: mapPath ?? null, hp,
      visibleTokenIds: idsOf((how) => how !== 'unseen'),
      sensedTokenIds: idsOf((how) => how === 'sensed'),
    };
  }

  protected render(container: HTMLElement, scene: InitiativeScene, settings: PlayerSettings): void {
    const { initiative, initiativeTrackerOpen } = scene;
    if (!settings.showInitiative || !initiativeTrackerOpen || !initiative) return;
    const visibleTokenIds = new Set(scene.visibleTokenIds.split(TOKEN_ID_SEPARATOR));
    const sensedTokenIds = new Set(scene.sensedTokenIds.split(TOKEN_ID_SEPARATOR));
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
    for (const entry of entries) {
      const sensed = sensedTokenIds.has(entry.tokenId);
      const hp = hpVisible && !sensed ? hpOf[initiative.entries.indexOf(entry)] ?? null : null;
      this.renderEntry(list, sensed ? { ...entry, imagePath: '' } : entry, settings, initiative.isActive, hp);
    }
    if (initiative.isActive) {
      panel.createDiv({ cls: 'atlas-player-initiative__round', text: `Round ${initiative.round}` });
    }
  }

  private renderEntry(parent: HTMLElement, entry: InitiativeEntry, settings: PlayerSettings, combatActive: boolean, hp: ResourceValue | null): void {
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
    if (hp && hp.max > 0) {
      card.createEl('progress', {
        cls: 'atlas-player-initiative__hp',
        attr: { max: hp.max, value: Math.max(0, hp.current), 'aria-label': 'HP' },
      });
    }
  }
}
