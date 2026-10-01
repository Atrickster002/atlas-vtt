import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../src/app/types';

const state = vi.hoisted(() => ({
  initiativeTrackerOpen: true,
  initiative: { entries: [] as unknown[], removedTokenIds: [] as string[], isActive: false, round: 0 },
  objects: { tokens: {} as Record<string, unknown> },
  tokenSettings: { showInstanceBadges: true },
  addToInitiative: vi.fn(),
  removeFromInitiative: vi.fn(),
  rollAllInitiative: vi.fn(),
  rollEntryInitiative: vi.fn(),
  nextTurn: vi.fn(),
  previousTurn: vi.fn(),
  reorderInitiative: vi.fn(),
  moveToFront: vi.fn(),
  moveToBack: vi.fn(),
  startCombat: vi.fn(),
  endCombat: vi.fn(),
  updateInitiativeEntry: vi.fn(),
}));

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({ app: null, view: null }),
}));

vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (storeState: typeof state) => unknown) => selector(state),
}));

vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));

vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null, notePath: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';

/** An entry as older scene files hold it for a token without hit points: no `hp` at all. */
function entryWithoutHp(tokenId: string): InitiativeEntry {
  return {
    id: `entry-${tokenId}`, tokenId, name: 'Crate', initiative: 0, initiativeModifier: 0,
    imagePath: 'tokens/crate.png', isDefeated: false, isActive: false, isNPC: true, order: 0,
  };
}

const crate: TokenEntity = { id: 'crate', kind: 'token', x: 0, y: 0, imagePath: 'tokens/crate.png' };

beforeEach(() => {
  vi.clearAllMocks();
  state.initiative.entries = [];
  state.objects.tokens = {};
});

describe('initiative entries of tokens without hit points', () => {
  it('shows the card of an entry saved without hit points, without an HP bar', () => {
    state.initiative.entries = [entryWithoutHp('crate')];
    state.objects.tokens = { crate };

    const { container } = render(<InitiativeTracker />);

    expect(container.querySelectorAll('.atlas-initiative-card')).toHaveLength(1);
    expect(container.querySelector('.atlas-initiative-card__hp-bar')).toBeNull();
  });

  it('still shows the HP bar of a token with hit points', () => {
    const hp = { current: 5, max: 10 };
    state.initiative.entries = [{ ...entryWithoutHp('orc'), hp }];
    state.objects.tokens = { orc: { ...crate, id: 'orc', kind: 'character', name: 'Crate', hp } };

    const { container } = render(<InitiativeTracker />);

    expect(container.querySelector<HTMLElement>('.atlas-initiative-card__hp-fill')?.style.width).toBe('50%');
  });

  it.each<[string, TokenEntity]>([
    ['a plain token', crate],
    ['a creature without a statblock', { ...crate, kind: 'character', name: 'Stranger' }],
  ])('adds %s without inventing hit points', (_label, token) => {
    state.objects.tokens = { crate: token };

    render(<InitiativeTracker />);

    expect(state.addToInitiative).toHaveBeenCalledTimes(1);
    expect(state.addToInitiative.mock.calls[0]?.[0]).not.toHaveProperty('hp');
    expect(state.addToInitiative.mock.calls[0]?.[0]).toMatchObject({ tokenId: 'crate', isDefeated: false });
  });

  it('gives an entry saved without hit points those of its token', () => {
    state.initiative.entries = [entryWithoutHp('orc')];
    state.objects.tokens = { orc: { ...crate, id: 'orc', kind: 'character', name: 'Crate', hp: { current: 0, max: 7 } } };

    render(<InitiativeTracker />);

    expect(state.updateInitiativeEntry).toHaveBeenCalledWith('entry-orc', { hp: { current: 0, max: 7 }, isDefeated: true });
  });

  it('drops the hit points of an entry whose token has none any more', () => {
    state.initiative.entries = [{ ...entryWithoutHp('orc'), hp: { current: 0, max: 7 }, isDefeated: true }];
    state.objects.tokens = { orc: { ...crate, id: 'orc', kind: 'character', name: 'Crate' } };

    render(<InitiativeTracker />);

    expect(state.updateInitiativeEntry).toHaveBeenCalledWith('entry-orc', { hp: undefined, isDefeated: false });
  });

  it.each<[string, Partial<TokenEntity>]>([
    ['hit points stored as a plain number', { hp: 12 }],
    ['no hit points', {}],
  ])('shows a creature with %s as defeated with an empty bar after Kill', (_label, vitals) => {
    const orc = { ...crate, id: 'orc', kind: 'character', name: 'Crate', ...vitals } as TokenEntity;
    const hp = orc.kind === 'character' && typeof orc.hp === 'number' ? { current: orc.hp, max: orc.hp } : undefined;
    state.initiative.entries = [{ ...entryWithoutHp('orc'), ...(hp ? { hp } : {}) }];
    // What the store's killTokens leaves on such a token
    state.objects.tokens = { orc: { ...orc, hp: 0 } };

    render(<InitiativeTracker />);

    expect(state.updateInitiativeEntry).toHaveBeenCalledWith('entry-orc', { hp: { current: 0, max: 0 }, isDefeated: true });
  });
});
