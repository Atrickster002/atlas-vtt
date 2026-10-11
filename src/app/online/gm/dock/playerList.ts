import { Menu, setIcon } from 'obsidian';
import { createTokenPortrait } from '../../../packages/components/shared/tokenPortraitElement';
import { showBelow } from './controls.ts';
import type { GroupPlayer, OnlinePlayer, PlayerGroup, TokenRow } from './panelModel.ts';

/** What the list's rows and menus do. */
export interface ListActions {
  /** Selects the token on the shared map. */
  selectToken(tokenId: string): void;
  assign(tokenIds: readonly string[], playerId: string): void;
  release(tokenIds: readonly string[]): void;
  unmark(tokenIds: readonly string[]): void;
  kick(playerId: string): void;
  /** The tokens selected on the shared map, for "Assign selected tokens here". */
  selected(): readonly string[];
  /** The URL the vault serves an image path at. */
  imageSrc(imagePath: string): string;
}

/** The player's initial in their colour, with a dot for whether they are here. */
function avatar(parent: HTMLElement, player: GroupPlayer): void {
  const presence = player.online ? 'atlas-online-tone--green' : 'atlas-online-tone--muted';
  parent.createSpan({ cls: `atlas-online-avatar atlas-online-colour-${player.colour} ${presence}`, text: player.initial, attr: { 'aria-hidden': 'true' } });
}

/**
 * A player's row: avatar (its dot says whether they are here), name, and their menu, a ghost button
 * that shows while the pointer is over the row or focus is in it.
 */
function playerRow(list: HTMLElement, player: GroupPlayer, tokens: readonly TokenRow[], actions: ListActions): void {
  const row = list.createDiv({ cls: ['atlas-online-player', ...(player.online ? [] : ['is-away'])] });
  avatar(row, player);
  row.createSpan({ cls: 'atlas-online-player__name', text: player.name });
  row.createSpan({ cls: 'atlas-online-sr-only', text: player.online ? 'Online' : 'Away' });
  const more = row.createEl('button', { cls: 'atlas-online-icon-button atlas-online-player__more', attr: { type: 'button', 'aria-label': `${player.name}: options`, 'aria-haspopup': 'menu', 'data-focus-key': `player:${player.id}` } });
  setIcon(more, 'more-horizontal');
  more.addEventListener('click', () => {
    const selected = actions.selected();
    const owned = tokens.map((token) => token.tokenId);
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('Assign selected tokens here').setIcon('user-plus').setDisabled(selected.length === 0).onClick(() => actions.assign(selected, player.id)));
    menu.addItem((item) => item.setTitle('Release all').setIcon('undo-2').setDisabled(owned.length === 0).onClick(() => actions.release(owned)));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle('Remove from table').setIcon('user-x').setWarning(true).onClick(() => actions.kick(player.id)));
    showBelow(menu, more);
  });
}

/**
 * Who plays the token, inside its row at the right; it shows with the row's hover or focus (always on
 * touch screens).
 */
function ownerPicker(row: HTMLElement, token: TokenRow, players: readonly OnlinePlayer[], actions: ListActions): void {
  const owner = token.owner;
  const picker = row.createEl('button', {
    cls: `atlas-online-owner ${owner === null ? 'atlas-online-owner--free' : `atlas-online-colour-${owner.colour}`}`,
    attr: { type: 'button', 'aria-haspopup': 'menu', 'aria-label': `${token.label}: ${owner === null ? 'free, assign to a player' : `played by ${owner.name}`}`, 'data-focus-key': `chip:${token.tokenId}` },
  });
  if (owner !== null) picker.createSpan({ cls: 'atlas-online-owner__dot', attr: { 'aria-hidden': 'true' } });
  picker.createSpan({ cls: 'atlas-online-owner__text', text: owner?.name ?? 'Assign' });
  setIcon(picker.createSpan({ cls: 'atlas-online-chevron' }), 'chevron-down');
  picker.addEventListener('click', () => {
    const menu = new Menu();
    for (const player of players) {
      menu.addItem((item) => item.setTitle(player.online ? player.name : `${player.name} (away)`).setChecked(owner?.id === player.id).onClick(() => actions.assign([token.tokenId], player.id)));
    }
    if (players.length > 0) menu.addSeparator();
    menu.addItem((item) => item.setTitle('Release').setIcon('undo-2').setDisabled(owner === null).onClick(() => actions.release([token.tokenId])));
    menu.addItem((item) => item.setTitle('Not a player token').setIcon('shield').onClick(() => actions.unmark([token.tokenId])));
    showBelow(menu, picker);
  });
}

/** A token's row: pressing it selects the token on the map; its owner picker sits inside, at the right. */
function tokenRow(list: HTMLElement, token: TokenRow, players: readonly OnlinePlayer[], actions: ListActions): void {
  const row = list.createDiv({ cls: 'atlas-online-token' });
  const main = row.createEl('button', { cls: 'atlas-online-token__main', attr: { type: 'button', 'data-focus-key': `token:${token.tokenId}` } });
  createTokenPortrait(main, { src: actions.imageSrc(token.imagePath), alt: '', showRing: token.showRing, ringColor: token.ringColor ?? undefined, cls: 'atlas-online-token__portrait' });
  main.createSpan({ cls: 'atlas-online-token__name', text: token.label });
  if (token.hidden) {
    const hidden = main.createSpan({ cls: 'atlas-online-token__hidden', attr: { 'aria-label': 'Hidden from players' } });
    setIcon(hidden, 'eye-off');
  }
  main.addEventListener('click', () => actions.selectToken(token.tokenId));
  ownerPicker(row, token, players, actions);
}

/** The players, each with their tokens, then the free player tokens. */
export function renderPlayerList(parent: HTMLElement, groups: readonly PlayerGroup[], players: readonly OnlinePlayer[], actions: ListActions): HTMLElement {
  const list = parent.createDiv({ cls: 'atlas-online-list', attr: { 'data-scroll-key': 'list' } });
  for (const group of groups) {
    if (group.player === null && group.tokens.length === 0) continue;
    const block = list.createDiv({ cls: 'atlas-online-group' });
    if (group.player !== null) playerRow(block, group.player, group.tokens, actions);
    else block.createDiv({ cls: 'atlas-online-group-label', text: 'Unclaimed' });
    for (const token of group.tokens) tokenRow(block, token, players, actions);
  }
  return list;
}
