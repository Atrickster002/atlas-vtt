import type { WorkspaceLeaf } from 'obsidian';
import type { AccountView } from '../account/accountView.ts';
import type { GateActions, GateView } from '../joinGate.ts';
import { gateRowsOf, type GateRows } from './gateRows.ts';
import type { OnlineControl } from '../OnlineControl.ts';
import { closingText, type LostTable } from '../tableEnd.ts';

/**
 * What the control on the map reads of online play, and what it shows from that. The control reads
 * one snapshot and calls a few actions; only this file knows `OnlineControl`'s own names. Everything
 * but `onlineApi` is pure.
 */

export type OnlineStatus = 'idle' | 'starting' | 'connecting' | 'online' | 'reconnecting' | 'stopped' | 'refused';

export interface OnlinePlayer {
  readonly id: string;
  readonly name: string;
  readonly online: boolean;
}

export interface PlayerTokenClaim {
  readonly tokenId: string;
  /** What the GM calls the token. */
  readonly label: string;
  /** The id of the player who has it, or null while it is free. */
  readonly claimedBy: string | null;
}

export interface OnlineSnapshot {
  readonly status: OnlineStatus;
  readonly link: string | null;
  /** The Atlas tab players see live: it shows the scene Atlas presents to its player view now. */
  readonly sharedLeaf: WorkspaceLeaf | null;
  /** The name of the scene players see, or null while they see none. */
  readonly sharedName: string | null;
  /** The tokens of the scene players see, as they see it (as they last saw it while the GM works on another scene). */
  readonly sharedTokens: Readonly<Record<string, SceneToken>>;
  readonly players: readonly OnlinePlayer[];
  /** The player tokens of the shared scene (of the active tab while no table runs). */
  readonly playerTokens: readonly PlayerTokenClaim[];
  /** The players the running table seats, by the GM's plan; null while none runs. */
  readonly seats: number | null;
  /** The running table's gates: the join code, the two switches, who waits for an answer; null while none runs. */
  readonly gate: GateView | null;
  /** Players are shown an image over the map ("Display on player view"); absent while they are shown none. */
  readonly imageShown?: boolean;
  /** How the last table ended, when the server ended it; absent once another was started. */
  readonly lost?: LostTable;
  /** When the relay closes the running table because its account may no longer host; absent while it does not. */
  readonly closesAt?: number;
}

export interface OnlineApi {
  snapshot(): OnlineSnapshot;
  start(leaf: WorkspaceLeaf): void;
  stop(): void;
  share(leaf: WorkspaceLeaf): void;
  mark(tokenIds: readonly string[]): void;
  unmark(tokenIds: readonly string[]): void;
  /** Gives tokens to a player, and makes them player tokens. */
  assign(tokenIds: readonly string[], playerId: string): void;
  release(tokenIds: readonly string[]): void;
  kick(playerId: string): void;
  /** Takes the shown image away from every player, online and at Atlas's own player window. */
  hideImage(): void;
  /** The running table's gates; nothing happens while none runs. */
  readonly gate: GateActions;
  onChange(listener: () => void): () => void;
}

/** The part of `OnlineControl` the control uses. */
export type ControlSource = Pick<OnlineControl, 'onChange' | 'status' | 'link' | 'seats' | 'isStarting' | 'lost' | 'start' | 'stop' | 'share' | 'players' | 'kick' | 'playerTokens' | 'markPlayerTokens' | 'give'> & {
  readonly table: {
    readonly sharedTab: WorkspaceLeaf | null;
    readonly sharedStore: { getState(): { readonly objects: { readonly tokens: Readonly<Record<string, SceneToken>> } } } | null;
    readonly presentedName: string | null;
    readonly gate: GateActions & { view(): GateView };
    readonly image: { readonly isShown: boolean };
    readonly closesAt: number | null;
  } | null;
};

/**
 * The control's view of `OnlineControl`. A table that connects again after it was online is reconnecting.
 * `hideImage` takes the shown image away, from Atlas's own player window too, which the table does not know.
 */
export function onlineApi(control: ControlSource, hideImage: () => void): OnlineApi {
  let onlineLink: string | null = null;
  const status = (): OnlineStatus => {
    const current = control.status();
    if (current === 'online') onlineLink = control.link();
    if (current === 'connecting') return onlineLink !== null && onlineLink === control.link() ? 'reconnecting' : 'connecting';
    if (current !== null) return current;
    if (control.isStarting()) return 'starting';
    return control.lost() !== null ? 'refused' : 'idle';
  };
  return {
    snapshot: () => ({
      ...lostOf(control),
      status: status(),
      link: control.link(),
      sharedLeaf: control.table?.sharedTab ?? null,
      sharedName: control.table?.sharedStore === null ? null : control.table?.presentedName ?? null,
      sharedTokens: control.table?.sharedStore?.getState().objects.tokens ?? {},
      players: control.players(),
      playerTokens: control.playerTokens().map(({ tokenId, label, owner }) => ({ tokenId, label, claimedBy: owner?.id ?? null })),
      seats: control.seats(),
      gate: control.table?.gate.view() ?? null,
      ...(control.table?.image.isShown === true && { imageShown: true }),
    }),
    start: (leaf) => void control.start(leaf),
    stop: () => control.stop(),
    share: (leaf) => control.share(leaf),
    mark: (ids) => control.markPlayerTokens(ids, true),
    unmark: (ids) => control.markPlayerTokens(ids, false),
    assign: (ids, playerId) => {
      control.markPlayerTokens(ids, true);
      control.give(ids, playerId);
    },
    release: (ids) => control.give(ids, null),
    kick: (playerId) => control.kick(playerId),
    hideImage,
    gate: {
      newCode: () => control.table?.gate.newCode(),
      setRequireCode: (on) => control.table?.gate.setRequireCode(on),
      setAskToJoin: (on) => control.table?.gate.setAskToJoin(on),
      admit: (id) => control.table?.gate.admit(id),
      decline: (id) => control.table?.gate.decline(id),
      moved: () => control.table?.gate.moved(),
    },
    onChange: (listener) => control.onChange(listener),
  };
}

/** How the last table ended and when the running one closes, as the snapshot carries them: only what there is. */
function lostOf(control: ControlSource): Pick<OnlineSnapshot, 'lost' | 'closesAt'> {
  const lost = control.lost();
  const closesAt = control.table?.closesAt ?? null;
  return { ...(lost !== null && { lost }), ...(closesAt !== null && { closesAt }) };
}

/** Whether a table runs or is being created. */
export const isRunning = (status: OnlineStatus): boolean => status === 'starting' || status === 'connecting' || status === 'online' || status === 'reconnecting';

const onlineCount = (snapshot: OnlineSnapshot): number => snapshot.players.filter((player) => player.online).length;

export type Badge =
  | { readonly kind: 'none' }
  | { readonly kind: 'dot'; readonly tone: 'amber' | 'green' | 'red'; readonly pulse: boolean }
  | { readonly kind: 'count'; readonly count: number };

/** The mark on the closed control: how the table is doing, at a glance. */
export function badgeOf(snapshot: OnlineSnapshot, alert: boolean): Badge {
  if (alert) return { kind: 'dot', tone: 'red', pulse: false };
  const { status } = snapshot;
  if (status === 'starting' || status === 'connecting' || status === 'reconnecting') return { kind: 'dot', tone: 'amber', pulse: true };
  if (status !== 'online') return { kind: 'none' };
  const count = onlineCount(snapshot);
  return count === 0 ? { kind: 'dot', tone: 'green', pulse: false } : { kind: 'count', count };
}

/** The note under a full table's status: no newcomer is let in beyond the plan's seats. */
export function seatsNoteOf(snapshot: OnlineSnapshot): string | null {
  const { seats } = snapshot;
  if (seats === null || snapshot.status !== 'online' || onlineCount(snapshot) < seats) return null;
  return `Table full · ${seats === 1 ? '1 seat' : `${seats} seats`}`;
}

const playersText = (count: number): string => (count === 1 ? '1 player' : `${count} players`);

/** The line of a table that closes because its account may no longer host; null while it does not. */
export const closingOf = (snapshot: OnlineSnapshot): string | null => (snapshot.closesAt === undefined ? null : closingText(snapshot.closesAt));

/** The button's tooltip. */
export function tooltipOf(snapshot: OnlineSnapshot): string {
  if (!isRunning(snapshot.status)) return 'Online play';
  const count = onlineCount(snapshot);
  return count === 0 ? 'Online table · waiting for players' : `Online table · ${playersText(count)}`;
}

export type Tone = 'amber' | 'green' | 'red' | 'muted';

/** The table's status in words, and its colour. */
export function statusOf(snapshot: OnlineSnapshot): { readonly text: string; readonly tone: Tone } {
  switch (snapshot.status) {
    case 'starting': return { text: 'Starting…', tone: 'amber' };
    case 'connecting': return { text: 'Connecting…', tone: 'amber' };
    case 'reconnecting': return { text: 'Reconnecting…', tone: 'amber' };
    case 'online': return onlineCount(snapshot) === 0 ? { text: 'Online, waiting for players', tone: 'green' } : { text: `Online · ${playersText(onlineCount(snapshot))}`, tone: 'green' };
    case 'refused': return { text: 'The server closed the table', tone: 'red' };
    default: return { text: 'Not started', tone: 'muted' };
  }
}

/** A token as the panel shows it: the shared scene's record. */
export interface SceneToken {
  readonly imagePath: string;
  readonly showRing?: boolean;
  readonly ringColor?: string;
  readonly isHidden?: boolean;
}

/** What the control knows of the map views. */
export interface SceneFacts {
  /** The view the control sits in is the one players see. */
  readonly isShared: boolean;
  /** The tokens of the shared scene. */
  readonly tokens: Readonly<Record<string, SceneToken>>;
  /** The tokens selected in the control's view. */
  readonly selected: readonly string[];
}

export type MenuModel =
  | { readonly kind: 'start'; readonly account: AccountView; readonly starting: boolean; readonly lost: LostTable | null }
  | { readonly kind: 'waiting'; readonly link: string | null; readonly status: { readonly text: string; readonly tone: Tone }; readonly isShared: boolean; readonly gate: GateRows | null; readonly qr: boolean; readonly imageShown: boolean; readonly closing: string | null };

/** The connection menu: sign in and start a table (after one the server ended: how it ended), or the running table's link while players are awaited (`qr`: its QR card is open). */
export function menuModel(snapshot: OnlineSnapshot, scene: SceneFacts, account: AccountView, qr = false): MenuModel {
  if (!isRunning(snapshot.status) || snapshot.status === 'starting') return { kind: 'start', account, starting: snapshot.status === 'starting', lost: snapshot.status === 'refused' ? snapshot.lost ?? 'refused' : null };
  return { kind: 'waiting', link: snapshot.link, status: statusOf(snapshot), isShared: scene.isShared, gate: gateRowsOf(snapshot.gate), qr, imageShown: snapshot.imageShown === true, closing: closingOf(snapshot) };
}

/** The number of player colours (`atlas-online-colour-0` to `-7`). */
export const PLAYER_COLOURS = 8;

export interface GroupPlayer extends OnlinePlayer {
  readonly initial: string;
  /** The player's colour, 0 to `PLAYER_COLOURS - 1`, the same every time. */
  readonly colour: number;
}

export interface TokenRow {
  readonly tokenId: string;
  readonly label: string;
  readonly imagePath: string;
  readonly showRing: boolean;
  readonly ringColor: string | null;
  readonly hidden: boolean;
  readonly owner: GroupPlayer | null;
}

/** A player and their tokens, or (player null) the player tokens nobody has claimed. */
export interface PlayerGroup {
  readonly player: GroupPlayer | null;
  readonly tokens: readonly TokenRow[];
}

/** A colour from the player's id: a sum over its characters, so it never changes. */
export function playerColour(id: string): number {
  let sum = 0;
  for (const char of id) sum = (sum * 31 + char.charCodeAt(0)) % 9973;
  return sum % PLAYER_COLOURS;
}

const groupPlayer = (player: OnlinePlayer): GroupPlayer => ({ ...player, initial: (player.name.trim()[0] ?? '?').toUpperCase(), colour: playerColour(player.id) });

const byName = (a: OnlinePlayer, b: OnlinePlayer): number => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/**
 * The list: every player by name (so it never reorders when someone goes away), each with their tokens
 * in the scene's order, then the free player tokens. Tokens the scene no longer has are left out.
 */
export function groupsOf(snapshot: OnlineSnapshot, scene: SceneFacts): PlayerGroup[] {
  const players = [...snapshot.players].sort(byName).map(groupPlayer);
  const known = new Map(players.map((player) => [player.id, player]));
  const rows = snapshot.playerTokens.flatMap((claim): TokenRow[] => {
    const token = scene.tokens[claim.tokenId];
    if (token === undefined) return [];
    const owner = claim.claimedBy === null ? null : known.get(claim.claimedBy) ?? null;
    return [{ tokenId: claim.tokenId, label: claim.label, imagePath: token.imagePath, showRing: token.showRing !== false, ringColor: token.ringColor ?? null, hidden: token.isHidden === true, owner }];
  });
  const groups: PlayerGroup[] = players.map((player) => ({ player, tokens: rows.filter((row) => row.owner?.id === player.id) }));
  const free = rows.filter((row) => row.owner === null);
  return free.length > 0 || groups.length === 0 ? [...groups, { player: null, tokens: free }] : groups;
}

export type SelectionBar =
  | { readonly kind: 'share' }
  | { readonly kind: 'selected'; readonly tokenIds: readonly string[]; readonly action: 'mark' | 'unmark'; readonly canAssign: boolean };

/**
 * The bar at the panel's foot. In another view than the shared one, or while the GM works on another
 * scene there, it offers to show that view's map on the player view;
 * in the shared view it acts on the selected tokens: mark them, or unmark them once all are player
 * tokens, and give them to a player.
 */
export function selectionBarOf(snapshot: OnlineSnapshot, scene: SceneFacts): SelectionBar | null {
  if (!scene.isShared) return { kind: 'share' };
  const tokenIds = scene.selected.filter((id) => Object.hasOwn(scene.tokens, id));
  if (tokenIds.length === 0) return null;
  const marked = new Set(snapshot.playerTokens.map((claim) => claim.tokenId));
  return { kind: 'selected', tokenIds, action: tokenIds.every((id) => marked.has(id)) ? 'unmark' : 'mark', canAssign: snapshot.players.length > 0 };
}
