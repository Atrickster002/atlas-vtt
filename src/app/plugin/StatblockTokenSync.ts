import { App, TFile, type EventRef } from 'obsidian';
import type { ViewAtlasStore } from '../storeFactory';
import type { TokenEntity } from '../types';
import type { TokenUpdates } from '../types/viewState';
import type { ResourceDefsProvider } from '../resources/resourceTypes';
import { fillMissingResources, syncedResources } from '../resources/statblockResourceSync';
import { runUntracked } from '../stores/history';
import type { TokenStatblockLinkService, LinkChangeEvent } from '../services/TokenStatblockLinkService';
import { buildStatblockLinkUpdates, readStatblockVitals, STATBLOCK_UNLINK_UPDATES } from '../pixi/token-renderer/statblockFrontmatter';
import { runInBackground } from '../utils/backgroundTask';
import { statblockTokenAppearance } from './statblockTokenAppearance';

interface StatblockTokenLinks extends Pick<TokenStatblockLinkService,
  'readStatblockImage' | 'findAssetByAnyPath' | 'getStatblockLinkedToToken' |
  'linkTokenToStatblock' | 'readStatblockRecord'> {
  on(event: 'link-changed', listener: (change: LinkChangeEvent) => void): void;
  off(event: 'link-changed', listener: (change: LinkChangeEvent) => void): void;
}

/** Keeps the tokens of one map in step with their linked notes. */
export class StatblockTokenSync {
  private readonly metadataChange: EventRef;

  constructor(
    private readonly obsApp: App,
    private readonly store: ViewAtlasStore,
    private readonly tokenStatblockLinkService: StatblockTokenLinks,
    private readonly resourceDefsProvider: ResourceDefsProvider,
  ) {
    this.metadataChange = obsApp.metadataCache.on('changed', (file) => this.metadataChanged(file));
    tokenStatblockLinkService.on('link-changed', this.handleLinkChange);
  }

  public prepareToken(token: TokenEntity): Promise<TokenEntity> {
    return statblockTokenAppearance(this.obsApp, token, this.tokenStatblockLinkService, this.resourceDefsProvider);
  }

  public destroy(): void {
    this.obsApp.metadataCache.offref(this.metadataChange);
    this.tokenStatblockLinkService.off('link-changed', this.handleLinkChange);
  }

  private async metadataChanged(file: TFile): Promise<void> {
    // Check if this is a statblock file being edited
    const cache = this.obsApp.metadataCache.getFileCache(file);
    const metadata = cache;
    if (!metadata?.frontmatter) return;

    // Check if it's a character/statblock file (has HP or is marked as a character)
    const isCharacter = metadata.frontmatter.hp !== undefined ||
                       metadata.frontmatter.statblock !== undefined ||
                       metadata.frontmatter.isCharacter === true ||
                       metadata.frontmatter.type === 'character';

    if (isCharacter) {
      const statblockPath = file.path;

      await this.linkTokenNamedByImage(file);

      // Update tokens on the current map that are linked to this statblock with new data
      const vitals = readStatblockVitals(metadata.frontmatter);
      const tokens = this.store.getState().objects.tokens;
      for (const [tokenId, token] of Object.entries(tokens)) {
        if (token.kind !== 'character' || token.statblockPath !== statblockPath) continue;

        // Refresh statblock-derived data but keep live values such as the current HP
        const updates: TokenUpdates = { name: vitals.name || token.name };

        const resources = syncedResources(token, metadata.frontmatter, this.resourceDefsProvider());
        if (JSON.stringify(resources) !== JSON.stringify(token.resources ?? {})) {
          updates.resources = resources;
        }

        if (vitals.difficulty !== undefined) {
          updates.difficulty = vitals.difficulty;
        }

        this.store.getState().updateToken(tokenId, updates);
      }
    }
  }

  /**
   * A note whose picture names a token that links no statblock links that
   * token too. The picture alone never unlinks a token, takes one from another
   * statblock or changes the art of placed tokens: a statblock is shared by
   * many tokens, and its picture is only one of them.
   */
  private async linkTokenNamedByImage(file: TFile): Promise<void> {
    // Read through the link service so this listener and the writer agree
    // on which frontmatter key holds the statblock's image.
    const image = this.tokenStatblockLinkService.readStatblockImage(file);
    if (!image) return;
    const asset = await this.tokenStatblockLinkService.findAssetByAnyPath(image);
    if (!asset || asset.statblockPath) return;
    await this.tokenStatblockLinkService.linkTokenToStatblock(asset.imagePath, file.path, { updateStatblockAvatar: false });
  }

  private readonly handleLinkChange = (event: LinkChangeEvent): void => {
    // Find tokens on the current map that use the affected image
    const tokens = this.store.getState().objects.tokens;
    const affectedTokenIds = Object.keys(tokens).filter(
      (tokenId) => tokens[tokenId]?.imagePath === event.tokenImagePath
    );

    if (event.type === 'linked' && event.statblockPath) {
      // Token was linked to a statblock - update all instances with statblock data
      void this.updateTokensWithStatblockData(affectedTokenIds, event.statblockPath);
    } else if (event.type === 'unlinked') {
      // Token was unlinked from statblock - clear ALL statblock-derived data
      for (const tokenId of affectedTokenIds) {
        this.store.getState().updateToken(tokenId, STATBLOCK_UNLINK_UPDATES);
      }
    }
  };

  /** Linked tokens start the collection's resources they do not hold yet, e.g. one defined after they were placed. */
  public fillMissingResources(): void {
    if (this.store.getState().isPlayerView) return;
    runInBackground(fillMissingResources(
      {
        tokens: () => this.store.getState().objects.tokens,
        // Not an edit of the game master's: it must not become an undo step.
        apply: (entries) => runUntracked(this.store, () => this.store.getState().updateTokens(entries)),
      },
      this.resourceDefsProvider(),
      (path) => this.tokenStatblockLinkService.readStatblockRecord(path),
    ), 'Starting missing token resources');
  }

  /**
   * Updates multiple tokens with data from a statblock
   */
  private async updateTokensWithStatblockData(tokenIds: string[], statblockPath: string): Promise<void> {
    try {
      const statblockFile = this.obsApp.vault.getAbstractFileByPath(statblockPath);
      if (!(statblockFile instanceof TFile)) return;

      const metadata = this.obsApp.metadataCache.getFileCache(statblockFile);
      const frontmatter = metadata?.frontmatter;
      if (!frontmatter) return;

      for (const tokenId of tokenIds) {
        const token = this.store.getState().objects.tokens[tokenId];
        if (!token) continue;

        const currentName = token.kind === 'character' ? token.name : undefined;
        this.store.getState().updateToken(tokenId, {
          statblockPath,
          // Maxima set by hand belonged to the previous statblock.
          overriddenMax: undefined,
          ...buildStatblockLinkUpdates(frontmatter, currentName, this.resourceDefsProvider(), token.resources)
        });
      }
    } catch (error) {
      console.error('[TokenRenderer] Failed to update tokens with statblock data:', error);
    }
  }
}
