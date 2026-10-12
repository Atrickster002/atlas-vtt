import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { StoredCampaign } from '../../src/app/campaigns/campaignTypes';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';

const dialogs = vi.hoisted(() => ({ confirmAction: vi.fn() }));
vi.mock('../../src/app/ui/confirmDialog', () => ({ confirmAction: dialogs.confirmAction }));

import { Dashboard } from '../../src/app/react/components/dashboard/Dashboard';

const SCENE_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const DAY = 24 * 60 * 60 * 1000;

/** A vault with one scene and one map, and the campaigns in memory. */
async function renderDashboard(initial: StoredCampaign[] = []): Promise<{ app: App; storage: ReturnType<typeof memoryCampaigns>; mapId: string }> {
  const { app } = createInMemoryApp({
    files: {
      [SCENE_PATH]: JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: SCENE_PATH, objects: {} } }),
      'atlas-vtt/assets/keep.webp': 'WEBP',
    },
  });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const map = await assets.addAsset({ type: 'map', name: 'Keep', mapFilePath: 'atlas-vtt/assets/keep.webp', tags: [], collection: 'c' });
  const storage = memoryCampaigns(initial);
  render(<Dashboard app={app} campaignStorage={storage} onOpenScene={vi.fn()} onCreateMap={vi.fn()} onOpenAssetManager={vi.fn()} />);
  await screen.findAllByText('Cave');
  return { app, storage, mapId: map.id };
}

const nameField = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Campaign name' });
const stored = (storage: ReturnType<typeof memoryCampaigns>, name: string): StoredCampaign | undefined => storage.current().find((entry) => entry.name === name);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  AssetService.resetInstance();
});

describe('the campaigns on the dashboard', () => {
  it('starts with one line and a way to make the first campaign, which opens its page', async () => {
    const { storage } = await renderDashboard();
    expect(screen.getByText('No campaigns yet.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('Enter a name');
    expect(storage.current()).toEqual([]);

    fireEvent.change(nameField(), { target: { value: '  The Witherwild ' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });

    expect(stored(storage, 'The Witherwild')).toBeTruthy();
    expect(nameField().value).toBe('The Witherwild');
    expect(screen.getByText('Created just now')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.getByRole('button', { name: /The Witherwild/ })).toBeTruthy();
  });

  it('cancels a new campaign with Escape, and names a taken name while it is typed', async () => {
    const { storage } = await renderDashboard([{ id: 'a', name: 'Cairn', createdAt: Date.now() - 3 * DAY }]);
    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    fireEvent.change(nameField(), { target: { value: 'cairn' } });
    expect(screen.getByRole('alert').textContent).toBe('Another campaign has this name.');
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(storage.current()).toHaveLength(1);

    fireEvent.keyDown(nameField(), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Campaign name' })).toBeNull();
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeTruthy();
  });

  it('lists campaigns the most recently played first, with when and the next session', async () => {
    await renderDashboard([
      { id: 'a', name: 'Cairn', createdAt: Date.now() - 10 * DAY },
      { id: 'b', name: 'Witherwild', createdAt: Date.now() - 20 * DAY, lastPlayed: Date.now() - 2 * DAY, nextSession: '2026-10-18' },
    ]);
    const rows = within(screen.getByRole('region', { name: 'Campaigns' })).getAllByRole('button').filter((button) => button.textContent !== 'New campaign');
    expect(rows.map((row) => row.querySelector('.dashboard-row__name')?.textContent)).toEqual(['Witherwild', 'Cairn']);
    expect(rows[0]!.textContent).toContain('Last played 2d ago');
    expect(rows[0]!.textContent).toContain('Next session');
    expect(rows[1]!.textContent).toContain('Created 10d ago');
  });

  it('follows campaigns renamed, added and deleted elsewhere', async () => {
    const { storage } = await renderDashboard([{ id: 'a', name: 'Cairn', createdAt: 1 }]);
    act(() => storage.update('a', (entry) => ({ ...entry, name: 'Cairn: Blue Mouth Caves' })));
    expect(screen.getByRole('button', { name: /Cairn: Blue Mouth Caves/ })).toBeTruthy();
    act(() => storage.create({ id: 'b', name: 'Dolmenwood', createdAt: 2 }));
    expect(screen.getByRole('button', { name: /Dolmenwood/ })).toBeTruthy();
    act(() => storage.remove('a'));
    expect(screen.queryByRole('button', { name: /Cairn/ })).toBeNull();
  });
});

describe('a campaign\'s page', () => {
  async function openPage(initial: StoredCampaign[], name: string): Promise<Awaited<ReturnType<typeof renderDashboard>>> {
    const result = await renderDashboard(initial);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    await waitFor(() => expect(nameField().value).toBe(name));
    return result;
  }

  it('renames in place, keeps a taken name from being saved and reverts on Escape', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }, { id: 'b', name: 'Dolmenwood', createdAt: 2 }], 'Cairn');
    fireEvent.focus(nameField());
    fireEvent.change(nameField(), { target: { value: 'Dolmenwood' } });
    expect(screen.getByRole('alert').textContent).toBe('Another campaign has this name.');
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(stored(storage, 'Cairn')).toBeTruthy();

    fireEvent.change(nameField(), { target: { value: 'Cairn: Blue Mouth Caves' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.keyDown(nameField(), { key: 'Escape' });
    fireEvent.blur(nameField());
    expect(nameField().value).toBe('Cairn');
    expect(stored(storage, 'Cairn')).toBeTruthy();

    fireEvent.focus(nameField());
    fireEvent.change(nameField(), { target: { value: 'Cairn: Blue Mouth Caves' } });
    fireEvent.blur(nameField());
    expect(storage.current().find((entry) => entry.id === 'a')?.name).toBe('Cairn: Blue Mouth Caves');
  });

  it('saves the description on leaving it, and the next session as it is picked or cleared', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }], 'Cairn');
    const description = screen.getByRole('textbox', { name: 'Description' });
    fireEvent.focus(description);
    fireEvent.change(description, { target: { value: 'The olms rise.' } });
    expect(storage.current()[0]!.description).toBeUndefined();
    fireEvent.blur(description);
    expect(storage.current()[0]!.description).toBe('The olms rise.');

    const day = screen.getByLabelText('Next session') as HTMLInputElement;
    fireEvent.change(day, { target: { value: '2026-10-18' } });
    expect(storage.current()[0]!.nextSession).toBe('2026-10-18');
    fireEvent.click(screen.getByRole('button', { name: 'Clear next session' }));
    expect(storage.current()[0]!.nextSession).toBeUndefined();
    expect(day.value).toBe('');
  });

  it('takes any map or scene of the library as its world map, and lets it go again', async () => {
    const { storage, mapId } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }], 'Cairn');
    const trigger = screen.getByRole('button', { name: 'World map' });
    await waitFor(() => {
      fireEvent.click(trigger);
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['CaveScene', 'KeepMap']);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search maps and scenes' }), { target: { value: 'kee' } });
    fireEvent.click(screen.getByRole('option', { name: /Keep/ }));
    expect(storage.current()[0]!.worldMap).toBe(mapId);
    expect(trigger.textContent).toContain('Keep');

    fireEvent.click(screen.getByRole('button', { name: 'Clear world map' }));
    expect(storage.current()[0]!.worldMap).toBeUndefined();
  });

  it('deletes the campaign only once the GM confirms, saying what stays', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }], 'Cairn');
    dialogs.confirmAction.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }));
    await waitFor(() => expect(dialogs.confirmAction).toHaveBeenCalledTimes(1));
    expect(storage.current()).toHaveLength(1);
    expect(dialogs.confirmAction.mock.calls[0]![0]).toMatchObject({
      title: 'Delete Cairn?',
      message: ['The scenes, maps and tokens it used stay in your library.'],
      destructive: true,
    });

    dialogs.confirmAction.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }));
    await waitFor(() => expect(storage.current()).toHaveLength(0));
    expect(screen.getByText('No campaigns yet.')).toBeTruthy();
  });

  it('shows changes made elsewhere and returns to the dashboard when the campaign is deleted there', async () => {
    const { storage } = await openPage([{ id: 'a', name: 'Cairn', createdAt: 1 }], 'Cairn');
    act(() => storage.update('a', (entry) => ({ ...entry, name: 'Cairn: Blue Mouth Caves', description: 'Written on the laptop.' })));
    expect(nameField().value).toBe('Cairn: Blue Mouth Caves');
    expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).value).toBe('Written on the laptop.');

    act(() => storage.remove('a'));
    expect(screen.queryByRole('textbox', { name: 'Campaign name' })).toBeNull();
    expect(screen.getByText('No campaigns yet.')).toBeTruthy();
  });

  it('shows a campaign of a newer Atlas with its fields disabled and says why', async () => {
    await openPage([{ id: 'a', name: 'Cairn', createdAt: 1, format: 2 }], 'Cairn');
    expect(screen.getByText('This campaign was saved by a newer version of Atlas. Update Atlas to change it.')).toBeTruthy();
    expect(nameField().disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'World map' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Delete campaign' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
