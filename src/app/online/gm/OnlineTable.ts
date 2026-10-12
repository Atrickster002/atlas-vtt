import type { ConnectionStats } from '../protocol/index.ts';
import { normalizePath, type App, type WorkspaceLeaf } from 'obsidian';
import { showNotice } from '../../ui/notice';
import { randomHex } from '../../utils/randomHex';
import { scaleInWindow } from './assetVariants.ts';
import { ATLAS_VIEW_TYPE, type SceneStore } from './atlasView.ts';
import type { BookShelf } from './book/BookShelf.ts';
import { tableBook, type TableBook } from './book/tableBook.ts';
import { companionTimers, every } from './companionTimers.ts';
import type { CreatedTable } from './createdTable.ts';
import { ImageShare } from './image/ImageShare.ts';
import { PAUSED_TEXT, TableGate, type GateSettings } from './joinGate.ts';
import { gmRoll, type GmRollDraft, type GmRollRefusal } from './log/gmRolls.ts';
import { TableLog } from './log/TableLog.ts';
import type { Ownership } from './ownership.ts';
import { presentedScene, presentedSceneSource } from './presentedScene.ts';
import { bindScene, type SceneBinding } from './sceneBinding.ts';
import { imageMimeType } from './SceneShare.ts';
import { TabWatch, type LostReason } from './sharedTab.ts';
import { TableConnection, type TableStatus } from './TableConnection.ts';
import { closingText, tableEndOf, tableEndText, type TableEnd } from './tableEnd.ts';
import type { VaultImage } from './TokenShare.ts';

/** How often the presented tab is looked for, and the shared one checked. */
const WATCH_MS = 1_000;

/** What a table tells its owner: each change of its status, the shared map file, and its end. */
export interface OnlineTableEvents {
  status(status: TableStatus): void;
  /** Players see this map file now. */
  mapPath(path: string): void;
  /** The table ended: stopped (by the GM, or closed for a reload), or closed by the relay for good, for the reason given. */
  ended(end: 'stopped' | TableEnd): void;
  /** The gates' settings changed: they are kept with the table. */
  gate(settings: GateSettings): void;
  /** What the panels show of the gates changed: who waits, a pause. */
  changed(): void;
  /** The table's log changed: its panel draws anew and the log is kept with the table. */
  log(): void;
}

const LOST_NOTICES: Readonly<Record<LostReason, string | null>> = {
  closed: 'The shared map was closed. Players wait until it is open again.',
  gone: null,
  unpresented: 'Atlas presents no map. Players online wait until you show a map on the player view.',
};

/**
 * One running table: the socket, the join link, and the scene Atlas presents to its player view (the eye
 * on a scene tab), followed through Atlas's lifecycle (`TabWatch`). Players never follow the GM's own tab
 * switches: while the GM works on another scene tab they keep what they saw. While the presented tab is
 * gone (Atlas reloads, the tab was closed) or Atlas presents nothing, players are sent no scene; once a
 * view shows the presented scene it is shared.
 */
export class OnlineTable {
  private readonly app: App;
  private readonly connection: TableConnection;
  private readonly watch: TabWatch<SceneBinding>;
  private stopWatchTimer: () => void = () => undefined;
  private stopFollowingPresented: () => void = () => undefined;
  private currentStatus: TableStatus = 'connecting';
  private closing: number | null = null;
  /** The closing time the GM was last told with a notice: a reconnect names the same one again. */
  private toldClosing: number | null = null;
  private readonly events: OnlineTableEvents;
  readonly ownership: Ownership;
  /** The table's gates: the join code, the two switches, and who waits for an answer. */
  readonly gate: TableGate;
  /** The table's log: chat, rolls, who came and went. */
  readonly log: TableLog;
  /** The image the GM shows every player over the map, while one is shown. */
  readonly image: ImageShare;
  /** The players' books: each one's own pages besides the table, kept on this device's shelf. */
  private readonly books: TableBook;
  /** The join link players open. */
  readonly link: string;
  private readonly stopOwnership: () => void;

  constructor(app: App, origin: string, table: CreatedTable, mapPath: string | null, ownership: Ownership, gate: GateSettings, events: OnlineTableEvents, shelf: BookShelf, savedLog?: unknown) {
    this.app = app;
    this.ownership = ownership;
    this.events = events;
    this.link = `${origin}/#${table.code}`;
    this.gate = new TableGate(gate, {
      send: (frame) => this.connection.sendGate(frame),
      answer: (id, admit) => this.connection.answer(id, admit),
      save: (settings) => events.gate(settings),
      changed: () => events.changed(),
      paused: () => showNotice(PAUSED_TEXT),
      timers: companionTimers(),
    });
    const timers = companionTimers();
    this.log = new TableLog({
      send: (body, to) => this.connection.send(body, to),
      clock: () => Date.now(),
      now: () => timers.now(),
      randomId: () => randomHex(12),
      nameOf: (player) => ownership.nameOf(player),
      setTimer: (run, ms) => timers.setTimer(run, ms),
      clearTimer: (timer) => timers.clearTimer(timer),
      changed: () => events.log(),
      speaker: (who, key) => this.bound()?.share.dice.speaker(who, key) ?? Promise.resolve(null),
      rollInline: (formula) => this.bound()?.share.dice.quietRoll(formula) ?? null,
    }, savedLog);
    this.image = new ImageShare({
      send: (body, to) => this.connection.send(body, to),
      now: () => timers.now(),
      randomId: () => randomHex(12),
      scaleImage: scaleInWindow,
      changed: () => events.changed(),
      logShown: (shown, path) => this.log.imageShown(shown, path),
      loggedFile: (hash) => this.log.artFile(hash),
      readImage: (path) => this.readImage(path),
    });
    this.books = tableBook({
      app, shelf, ownership, randomId: () => randomHex(12),
      send: (body, to) => this.connection.send(body, to),
      scene: () => this.bound()?.book() ?? null,
      readImage: (path) => this.readImage(path),
      tokenWrites: () => this.bound()?.resources ?? null,
    });
    this.watch = new TabWatch<SceneBinding>({
      leaves: () => app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE),
      presented: () => presentedScene(app),
      bind: (tab, presented) => bindScene({
        app,
        seats: ownership,
        send: (body, to) => this.connection.send(body, to),
        sendLive: (body, key) => this.connection.sendLive(body, key),
        readImage: (path) => this.readImage(path),
        isLive: (binding) => this.watch.isLive(binding),
        randomId: () => randomHex(12),
        logRoll: (roll) => this.log.rolled(roll),
        logArt: (hash) => this.log.artFile(hash),
        rollRequest: (from, answer) => this.log.requestOf(from, answer),
        nameOf: (player) => ownership.nameOf(player),
      }, tab, presented),
      lost: (reason) => {
        this.withdraw();
        const notice = LOST_NOTICES[reason];
        if (notice !== null) showNotice(notice);
      },
      mapPath: (path) => events.mapPath(path),
    }, mapPath);
    this.connection = new TableConnection(origin, table.code, table.secret, {
      status: (status) => this.setStatus(status),
      // The scene and tokens first: the players' mine messages follow from the ownership change.
      welcome: (players) => {
        // Who came or went while the GM was away is in the log before it goes out again.
        this.log.welcome(players);
        this.resend();
        ownership.welcome(players);
      },
      joined: (player) => {
        // The log as it was, then the line that they joined, which everyone gets.
        this.resend(player.id);
        ownership.joined(player);
        this.log.joined(player);
      },
      left: (player) => {
        this.bound()?.share.playerLeft(player);
        this.image.playerLeft(player);
        this.books.share.playerLeft(player);
        ownership.left(player);
        this.log.left(player);
      },
      // The log, the shown image and the books are the table's, so they hear players while no scene is shared too.
      message: (from, body) => void (this.log.receive(from, body) || this.image.receive(from, body) || this.books.share.receive(from, body) || this.bound()?.share.receive(from, body)),
      access: (closesAt) => this.setClosing(closesAt),
    }, this.gate);
    this.stopOwnership = ownership.onChange(() => this.bound()?.share.ownersChanged());
  }

  /** The Atlas tab players see live: bound, and showing the presented scene now; null while there is none. */
  get sharedTab(): WorkspaceLeaf | null {
    const binding = this.watch.binding;
    return binding?.showing === true ? this.watch.current?.leaf ?? null : null;
  }

  /** The shared scene's store as players see it (frozen while the GM works on another tab), or null while none is shared. */
  get sharedStore(): SceneStore | null {
    return this.watch.binding?.store ?? null;
  }

  /** The name of the scene tab Atlas presents, or null while it presents none of the open tabs. */
  get presentedName(): string | null {
    return this.watch.presented?.name ?? null;
  }

  get status(): TableStatus {
    return this.currentStatus;
  }

  /** When the relay closes the table because its account may no longer host (the relay's clock), or null. */
  get closesAt(): number | null {
    return this.closing;
  }

  /** How the table's connection went, for feedback's diagnostics. */
  connectionStats(): ConnectionStats {
    return this.connection.stats();
  }

  /** A GM's roll from the log (its composer, a roll button, another plugin), on the shared scene's dice. */
  rollFromLog(draft: GmRollDraft): Promise<GmRollRefusal | null> {
    const binding = this.bound();
    return gmRoll(draft, this.log, binding?.share.dice ?? null, binding?.store ?? null);
  }

  /** Removes a player: their key stops working, their browser leaves the table and their tokens are nobody's. */
  kick(player: string): void {
    this.connection.kick(player);
    this.ownership.remove(player);
  }

  start(): void {
    this.connection.start();
    this.books.start();
    this.watch.check();
    this.stopWatchTimer = every(companionTimers(), WATCH_MS, () => this.watch.check());
    // Atlas presenting another scene is followed at once; the timer catches everything else
    this.stopFollowingPresented = presentedSceneSource(this.app)?.onChange(() => this.watch.check()) ?? ((): void => undefined);
  }

  /** Looks at the presented and the shared tab again (the workspace's layout changed). */
  checkLeaf(): void {
    this.watch.check();
  }

  /** Ends the table on the server and stops sharing. */
  end(): void {
    this.stopWatch();
    this.connection.end();
  }

  /** Closes the socket and stops sharing, leaving the table on the server: a reload comes back to it. */
  close(): void {
    this.stopWatch();
    this.connection.stop();
  }

  private setStatus(status: TableStatus): void {
    this.currentStatus = status;
    if (status === 'stopped') this.finish('stopped');
    else if (status === 'refused') {
      const end = tableEndOf(this.connection.closeCode);
      showNotice(tableEndText(end));
      this.finish(end);
    }
    this.events.status(status);
  }

  private finish(end: 'stopped' | TableEnd): void {
    this.stopWatch();
    this.stopOwnership();
    this.gate.dispose();
    this.log.dispose();
    this.books.stop();
    this.closing = null;
    this.events.ended(end);
  }

  /** The relay named when the table closes for want of access, or took it back; the GM is told once per time, also while the control is closed. */
  private setClosing(closesAt: number | null): void {
    if (closesAt === this.closing) return;
    this.closing = closesAt;
    if (closesAt !== null && closesAt !== this.toldClosing) {
      this.toldClosing = closesAt;
      showNotice(closingText(closesAt));
    }
    this.events.changed();
  }

  private stopWatch(): void {
    this.stopWatchTimer();
    this.stopFollowingPresented();
    this.watch.stop();
  }

  /** The binding of the tab shared now, while it is still the same tab; null while there is none. */
  private bound(): SceneBinding | null {
    const binding = this.watch.binding;
    return binding !== null && this.watch.isLive(binding) ? binding : null;
  }

  /** The scene, tokens and the rest to one player or to all, or no scene while the shared tab is gone; then the log, the shown image and the books. */
  private resend(to?: string): void {
    const binding = this.bound();
    if (binding === null) this.connection.send({ t: 'scene', scene: null }, to);
    else binding.share.resend(to);
    this.log.resend(to);
    this.image.resend(to);
    this.books.share.resend(to);
  }

  /** Players see no scene while the shared tab is gone, so nothing of what they saw lingers or moves. */
  private withdraw(): void {
    this.connection.send({ t: 'scene', scene: null });
  }

  private async readImage(path: string): Promise<VaultImage | null> {
    const mime = imageMimeType(path);
    const file = this.app.vault.getFileByPath(normalizePath(path));
    if (mime === null || file === null) return null;
    return { bytes: new Uint8Array(await this.app.vault.readBinary(file)), mime };
  }
}
