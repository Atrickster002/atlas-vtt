import type { GmMessage } from '../protocol/index.ts';

/** Who is connected and who owns which token. */
export interface MineSource {
  /** The ids of the players connected now. */
  onlinePlayers(): readonly string[];
  /** The owner of a token of the GM's scene, by its GM id. */
  ownerOf(tokenId: string): string | undefined;
}

/** The token list players were last sent: its scene, and the random id players know each token by, by GM id. */
export interface ListedTokens {
  readonly scene: string;
  readonly aliases: ReadonlyMap<string, string>;
}

/** The ids, as players know them, of the listed tokens that are the player's, sorted. */
export function mineOf(player: string, listed: ListedTokens, ownerOf: (tokenId: string) => string | undefined): string[] {
  return [...listed.aliases].filter(([tokenId]) => ownerOf(tokenId) === player).map(([, alias]) => alias).sort();
}

/**
 * Tells each connected player which tokens of the last list are theirs: a `mine` message to that
 * player alone, whenever their share changes. Only tokens in the list are named, so a hidden token
 * a player owns stays unknown to them.
 */
export class MineShare {
  private readonly source: MineSource;
  private readonly send: (body: GmMessage, to: string) => void;
  private listed: ListedTokens | null = null;
  /** What each player was last sent: scene and ids. */
  private readonly sent = new Map<string, string>();

  constructor(source: MineSource, send: (body: GmMessage, to: string) => void) {
    this.source = source;
    this.send = send;
  }

  /** The list players were just sent, or null while no scene's tokens are shared. */
  setList(listed: ListedTokens | null): void {
    this.listed = listed;
    this.update();
  }

  /** Sends each connected player their share where it changed. */
  update(): void {
    const listed = this.listed;
    if (listed === null) return;
    const online = new Set(this.source.onlinePlayers());
    for (const player of this.sent.keys()) if (!online.has(player)) this.sent.delete(player);
    for (const player of online) {
      const tokens = mineOf(player, listed, (tokenId) => this.source.ownerOf(tokenId));
      const key = JSON.stringify([listed.scene, tokens]);
      if (this.sent.get(player) === key) continue;
      this.sent.set(player, key);
      this.send({ t: 'mine', scene: listed.scene, tokens }, player);
    }
  }

  /** Sends the shares again, to one player or to all. */
  resend(to?: string): void {
    if (to === undefined) this.sent.clear();
    else this.sent.delete(to);
    this.update();
  }
}
