import { describe, expect, it, vi } from 'vitest';
import { groupsOf, type OnlineSnapshot, type SceneFacts } from '../../../../src/app/online/gm/dock/panelModel.ts';
import { renderPlayerList, type ListActions } from '../../../../src/app/online/gm/dock/playerList.ts';

const ANA = { id: 'a'.repeat(20), name: 'Ana', online: true };
const BEN = { id: 'b'.repeat(20), name: 'Ben', online: false };

const SCENE: SceneFacts = {
  isShared: true,
  selected: [],
  tokens: {
    cleric: { id: 'cleric', imagePath: 'art/cleric.png', showRing: true, ringColor: '#aa0000' },
    wolf: { id: 'wolf', imagePath: 'art/wolf.png' },
    bear: { id: 'bear', imagePath: 'art/bear.png' },
  } as unknown as SceneFacts['tokens'],
};

const snapshot = (over: Partial<OnlineSnapshot>): OnlineSnapshot => ({ status: 'online', link: null, sharedLeaf: null, sharedName: null, sharedTokens: {}, players: [], playerTokens: [], seats: null, gate: null, ...over });

function actions(): ListActions & { selectToken: ReturnType<typeof vi.fn<(id: string) => void>> } {
  return { selectToken: vi.fn<(id: string) => void>(), assign: vi.fn(), release: vi.fn(), unmark: vi.fn(), kick: vi.fn(), selected: () => [], imageSrc: (path) => `app://vault/${path}` };
}

function list(over: Partial<OnlineSnapshot>): { el: HTMLElement; does: ReturnType<typeof actions> } {
  const does = actions();
  const shot = snapshot(over);
  const el = renderPlayerList(document.body.createDiv(), groupsOf(shot, SCENE), shot.players, does);
  return { el, does };
}

/** What the GM reads in a row, without what only a screen reader hears. */
const shown = (row: Element): string => [...row.querySelectorAll('.atlas-online-player__name, .atlas-online-token__name')].map((part) => part.textContent ?? '').join(' | ');

describe('the players of an online table', () => {
  it('shows a player who plays a token as one entry: the token as their picture, under the name they chose', () => {
    const { el } = list({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', claimedBy: ANA.id }] });
    expect(el.querySelectorAll('.atlas-online-player')).toHaveLength(1);
    expect(el.querySelectorAll('.atlas-online-token')).toHaveLength(0);
    const row = el.querySelector('.atlas-online-player');
    expect(shown(row!)).toBe('Ana');
    const picture = row?.querySelector('.atlas-online-avatar');
    expect(picture?.querySelector('img')?.getAttribute('src')).toBe('app://vault/art/cleric.png');
    expect(picture?.textContent).toBe('');
    expect(picture?.classList.contains('atlas-online-tone--green')).toBe(true);
    // Which token it is stays said for a screen reader.
    expect(row?.querySelector('.atlas-online-sr-only')?.textContent).toBe('Online, plays Cleric');
  });

  it('keeps the initial for a player without a token, and says who is away', () => {
    const { el } = list({ players: [BEN], playerTokens: [] });
    const picture = el.querySelector('.atlas-online-player .atlas-online-avatar');
    expect(picture?.textContent).toBe('B');
    expect(picture?.querySelector('img')).toBeNull();
    expect(picture?.classList.contains('atlas-online-tone--muted')).toBe(true);
    expect(el.querySelector('.atlas-online-sr-only')?.textContent).toBe('Away');
  });

  it('lists a player\'s further tokens under them, and the tokens nobody plays under Unclaimed', () => {
    const { el } = list({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', claimedBy: ANA.id }, { tokenId: 'wolf', label: 'Wolf', claimedBy: ANA.id }, { tokenId: 'bear', label: 'Bear', claimedBy: null }] });
    const groups = [...el.querySelectorAll('.atlas-online-group')];
    expect(groups).toHaveLength(2);
    expect([...groups[0]!.querySelectorAll('.atlas-online-token__name')].map((name) => name.textContent)).toEqual(['Wolf']);
    expect(groups[1]?.querySelector('.atlas-online-group-label')?.textContent).toBe('Unclaimed');
    expect([...groups[1]!.querySelectorAll('.atlas-online-token__name')].map((name) => name.textContent)).toEqual(['Bear']);
  });

  it('selects the player\'s token on the map when their picture or name is pressed', () => {
    const { el, does } = list({ players: [ANA], playerTokens: [{ tokenId: 'cleric', label: 'Cleric', claimedBy: ANA.id }] });
    el.querySelector<HTMLButtonElement>('.atlas-online-player__main')?.click();
    expect(does.selectToken).toHaveBeenCalledWith('cleric');
  });
});
