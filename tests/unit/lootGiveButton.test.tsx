import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const showNotice = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/ui/notice', () => ({ showNotice }));

import { setLootRecipientSource, type LootRecipient, type LootRecipientSource } from '../../src/app/loot/lootRecipients';
import type { LootDraw } from '../../src/app/loot/lootRoller';
import { LootResultCard } from '../../src/app/react/components/loot/LootResultCard';

const ROPE: LootDraw = { id: 'rope', notePath: 'Loot/Rope.md', source: ['Items', 'Gear'], name: 'Rope', description: 'Fifty feet of hemp.', properties: [] };
const ANA: LootRecipient = { id: 'p1', name: 'Ana', character: 'Mira the Bold' };
const BEN: LootRecipient = { id: 'p2', name: 'Ben', character: null };

/** A table whose people the test names; `handsOver` is what `give` answers. */
function table(people: LootRecipient[], handsOver = true): LootRecipientSource & { give: ReturnType<typeof vi.fn>; seat: (next: LootRecipient[]) => void } {
  let seated = people;
  const listeners = new Set<() => void>();
  return {
    recipients: () => seated,
    give: vi.fn(() => handsOver),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    seat: (next) => {
      seated = next;
      for (const listener of listeners) listener();
    },
  };
}

function renderCard(): void {
  render(
    <ul>
      <LootResultCard draw={ROPE} fresh={false} order={0} onOpenSource={vi.fn()} onOpenLink={vi.fn()} shownToPlayers={false} onShowToPlayers={vi.fn()} />
    </ul>,
  );
}

const giveButton = (): HTMLElement | null => screen.queryByRole('button', { name: 'Give to player' });

async function openMenu(): Promise<void> {
  fireEvent.pointerDown(giveButton()!, { button: 0, ctrlKey: false });
  await screen.findByRole('menu');
}

describe('handing a rolled item to a player', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });
  });

  afterEach(() => {
    cleanup();
    setLootRecipientSource(null);
    showNotice.mockClear();
    vi.unstubAllGlobals();
  });

  it('offers nothing while nobody is at the table', () => {
    renderCard();
    expect(giveButton()).toBeNull();
    expect(screen.getByRole('button', { name: 'Show to players' })).toBeTruthy();

    setLootRecipientSource(table([]));
    cleanup();
    renderCard();
    expect(giveButton()).toBeNull();
  });

  it('shows the button once someone joins and takes it away when they leave', () => {
    const source = table([]);
    setLootRecipientSource(source);
    renderCard();
    act(() => source.seat([ANA]));
    expect(giveButton()).toBeTruthy();
    act(() => source.seat([]));
    expect(giveButton()).toBeNull();
  });

  it('lists the people with their characters, and nobody can pick one who plays none', async () => {
    setLootRecipientSource(table([ANA, BEN]));
    renderCard();
    await openMenu();

    const rows = screen.getAllByRole('menuitem');
    expect(rows.map((row) => row.textContent)).toEqual(['AnaMira the Bold', 'BenNo character']);
    expect(rows[0]!.hasAttribute('data-disabled')).toBe(false);
    expect(rows[1]!.getAttribute('aria-disabled')).toBe('true');
  });

  it('hands nothing to someone who plays no character', async () => {
    const source = table([ANA, BEN]);
    setLootRecipientSource(source);
    renderCard();
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Ben/ }));

    expect(source.give).not.toHaveBeenCalled();
    expect(showNotice).not.toHaveBeenCalled();
  });

  it('hands the item to the chosen player and says so', async () => {
    const source = table([ANA, BEN]);
    setLootRecipientSource(source);
    renderCard();
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Ana/ }));

    expect(source.give).toHaveBeenCalledExactlyOnceWith('p1', ROPE);
    expect(showNotice).toHaveBeenCalledExactlyOnceWith('Rope given to Ana');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('says when the item could not be handed over', async () => {
    const source = table([ANA], false);
    setLootRecipientSource(source);
    renderCard();
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Ana/ }));

    expect(source.give).toHaveBeenCalledWith('p1', ROPE);
    expect(showNotice).toHaveBeenCalledExactlyOnceWith('Rope could not be handed to Ana');
  });
});
