import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { TFile } from 'obsidian';
import css from '../../styles/main.scss?inline';
import type { StoredCampaign } from '../../src/app/campaigns/campaignTypes';
import { Dashboard } from '../../src/app/react/components/dashboard/Dashboard';
import { AssetService } from '../../src/app/services/AssetService';
import { mapThumbnailPath } from '../../src/app/utils/dataFileMigration';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { memoryPresets } from '../mocks/memoryPresets';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { DASHBOARD_THEME as THEME } from './dashboardTheme';

// The campaign's game system dialog can delete a preset, which reaches the map views' services.
vi.mock('events', async () => import('eventemitter3'));

/**
 * The dashboard with campaigns, laid out by the plugin's stylesheet over Obsidian's default theme
 * variables (light and dark). Each test also saves a screenshot beside it, in `__screenshots__`, for a look by eye.
 */
const SCENE_PATH = 'atlas-vtt/collections/Cairn/scenes/Blue Mouth Caves.atlasmap';
const OTHER_SCENE = 'atlas-vtt/collections/Cairn/scenes/Hollow Oak.atlasmap';
const DAY = 24 * 60 * 60 * 1000;
const sceneFile = (path: string): string => JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: path, objects: {} } });

/** Cut-out art, as tokens without a ring have: a figure on a transparent ground. */
function cutOut(hue: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.fillStyle = `hsl(${hue}, 45%, 50%)`;
  context.beginPath();
  context.ellipse(48, 30, 18, 20, 0, 0, Math.PI * 2);
  context.ellipse(48, 82, 32, 30, 0, Math.PI, Math.PI * 2);
  context.fill();
  return canvas.toDataURL();
}

/** A small painted picture standing in for a scene's thumbnail. */
function picture(hue: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 100;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 160, 100);
  gradient.addColorStop(0, `hsl(${hue}, 35%, 45%)`);
  gradient.addColorStop(1, `hsl(${hue + 40}, 30%, 25%)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 160, 100);
  return canvas.toDataURL();
}

const PARTY = [
  { name: 'Aria', art: 'art/aria.webp', hue: 10, ring: true },
  { name: 'Finn', art: 'art/finn.webp', hue: 130, ring: true },
  { name: 'Tamsin', art: 'art/tamsin.webp', hue: 250, ring: true },
  { name: 'Brom', art: 'art/brom.webp', hue: 40, ring: false },
  { name: 'Wren', art: 'art/wren.webp', hue: 300, ring: false },
];

/** The cave scene's file, with the party standing on it. */
const caveWithParty = (): string => JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt', version: 4, mapPath: SCENE_PATH,
    objects: { tokens: Object.fromEntries(PARTY.map((member, index) => [`t${index}`, { imagePath: member.art, ...(index === 0 && { ringColor: '#c0392b' }) }])) },
  },
});

/** Mounts the dashboard; `campaigns` gets the id of each scene by name, for world maps and last scenes. */
async function mount(theme: 'light' | 'dark', campaigns: (sceneIds: Map<string, string>) => StoredCampaign[] = () => [], { party = false }: { party?: boolean } = {}): Promise<ReturnType<typeof memoryCampaigns>> {
  document.body.className = `theme-${theme}`;
  const { app } = createInMemoryApp({
    files: {
      [SCENE_PATH]: party ? caveWithParty() : sceneFile(SCENE_PATH),
      [OTHER_SCENE]: sceneFile(OTHER_SCENE),
      [mapThumbnailPath(SCENE_PATH)]: 'JPG',
      [mapThumbnailPath(OTHER_SCENE)]: 'JPG',
      ...Object.fromEntries(PARTY.map((member) => [member.art, 'WEBP'])),
    },
  });
  const pictures = new Map([
    [mapThumbnailPath(SCENE_PATH), picture(200)],
    [mapThumbnailPath(OTHER_SCENE), picture(90)],
    ...PARTY.map((member) => [member.art, member.ring ? picture(member.hue) : cutOut(member.hue)] as const),
  ]);
  vi.mocked(app.vault.getResourcePath).mockImplementation((file: TFile) => pictures.get(file.path) ?? '');
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  if (party) {
    await assets.addAssets(PARTY.map((member) => ({
      type: 'token' as const, name: member.name, imagePath: member.art, tags: [], collection: 'Cairn', playerCharacter: true as const, showRing: member.ring,
    })));
  }
  const scenes = await assets.getAssets(undefined, 'scene');
  const storage = memoryCampaigns(campaigns(new Map(scenes.map((scene) => [scene.name, scene.id]))));
  render(
    React.createElement('div', { className: 'workspace-leaf-content atlas-dashboard-view atlas-vtt-plugin' },
      React.createElement(Dashboard, { app, campaignStorage: storage, onOpenScene: vi.fn(), onCreateMap: vi.fn(), onOpenAssetManager: vi.fn() })),
  );
  await expect.poll(() => document.querySelectorAll('.recent-scenes .dashboard-row').length).toBe(2);
  return storage;
}

const query = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
const shot = (name: string): Promise<string> => page.screenshot({ path: `__screenshots__/atlas-campaigns-${name}.png`, element: query('.atlas-dashboard-view') });
const buttonNamed = (name: string): HTMLButtonElement => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === name)!;

function campaignsOf(sceneIds: Map<string, string>): StoredCampaign[] {
  const now = Date.now();
  const caveId = sceneIds.get('Blue Mouth Caves')!;
  return [
    { id: 'a', name: 'Rise of the Blood Olms', createdAt: now - 30 * DAY, lastPlayed: now - 2 * DAY, nextSession: '2026-10-18', worldMap: caveId },
    { id: 'b', name: 'The Witherwild', createdAt: now - 12 * DAY, lastPlayed: now - 9 * DAY },
    { id: 'c', name: 'Dolmenwood', createdAt: now - 3 * 60 * 60 * 1000 },
  ];
}

describe('the dashboard with campaigns', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1280, 860);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
    AssetService.resetInstance();
    vi.restoreAllMocks();
  });

  for (const theme of ['dark', 'light'] as const) {
    it(`lists campaigns as rows as tall as the recent scenes (${theme})`, async () => {
      await mount(theme, campaignsOf);
      const campaignRow = query('.campaigns-panel .dashboard-row').getBoundingClientRect();
      const sceneRow = query('.recent-scenes .dashboard-row').getBoundingClientRect();
      expect(campaignRow.height).toBeCloseTo(sceneRow.height, 0);
      expect(query('.campaigns-panel .dashboard-row img').getAttribute('src')).toMatch(/^data:image/);
      await shot(`dashboard-${theme}`);
    });

    it(`shows a campaign's page and its world map picker (${theme})`, async () => {
      const storage = await mount(theme, campaignsOf);
      act(() => storage.update('a', (entry) => ({ ...entry, description: 'Blue Mouth Caves, below the Hollow Oak. The olms rise when the river runs red.' })));
      fireEvent.click(query('.campaigns-panel .dashboard-row'));
      await expect.poll(() => document.querySelector('.campaign-page')).not.toBeNull();
      // The play row holds the party's room before any face is there.
      expect(query('.campaign-page__play').offsetHeight).toBe(44);
      // Every control of a settings row ends at the panel's inner edge.
      const inner = query('.campaign-settings').getBoundingClientRect().right - 1 - 12;
      for (const row of document.querySelectorAll('.campaign-setting')) {
        expect((row.lastElementChild as HTMLElement).getBoundingClientRect().right).toBeCloseTo(inner, 0);
      }
      await shot(`page-${theme}`);
      fireEvent.click(query('.world-map-picker__trigger'));
      await expect.poll(() => document.querySelectorAll('.world-map-picker__option').length).toBe(2);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await shot(`picker-${theme}`);
    });
  }

  for (const theme of ['dark', 'light'] as const) {
    it(`names the campaign's game system in a row like the others, and opens its settings (${theme})`, async () => {
      vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(memoryPresets() as unknown as SystemPresetFiles);
      const system = { systemPresetId: 'builtin:cairn', gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, conditions: [], dice: { defaultRoll: '1d12', crit: 'roll-under' } };
      await mount(theme, (sceneIds) => campaignsOf(sceneIds).map((campaign) => (campaign.id === 'a' ? { ...campaign, system } : campaign)));
      fireEvent.click(query('.campaigns-panel .dashboard-row'));
      await expect.poll(() => document.querySelector('.campaign-system__trigger')).not.toBeNull();
      const trigger = query('.campaign-system__trigger').getBoundingClientRect();
      const worldMap = query('.world-map-picker__trigger').getBoundingClientRect();
      expect(trigger.height).toBeCloseTo(worldMap.height, 0);
      expect(trigger.left).toBeCloseTo(worldMap.left, 0);
      expect(trigger.right).toBeCloseTo(worldMap.right, 0);
      expect(query('.campaign-system__trigger').textContent).toContain('Cairn');
      expect(query('.campaign-system__trigger').textContent).toContain('Edited');
      await shot(`system-row-${theme}`);

      fireEvent.click(query('.campaign-system__trigger'));
      await expect.poll(() => document.querySelector('.atlas-collection-settings-modal [role="radio"][aria-checked="true"]')).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const modal = query('.atlas-collection-settings-modal');
      const tabs = [...modal.querySelectorAll('.atlas-collection-settings-tab')].map((tab) => tab.textContent);
      expect(tabs).toEqual(['Game System', 'Dice', 'Grid & Measure', 'Conditions', 'Resources', 'Initiative']);
      // The close button sits in the header's corner, inside the dialog.
      const close = modal.querySelector('.atlas-collection-settings-header button')!.getBoundingClientRect();
      const box = modal.getBoundingClientRect();
      expect(close.right).toBeLessThan(box.right);
      expect(close.top).toBeGreaterThan(box.top);
      await page.screenshot({ path: `__screenshots__/atlas-campaigns-system-dialog-${theme}.png`, element: modal });
    });

    it(`shows the party of the last scene at the row's end: ringed faces as a fan, the others side by side (${theme})`, async () => {
      await mount(theme, (sceneIds) => [
        ...campaignsOf(sceneIds).map((campaign) => (campaign.id === 'a' ? { ...campaign, lastScene: sceneIds.get('Blue Mouth Caves')! } : campaign)),
      ], { party: true });
      await expect.poll(() => document.querySelectorAll('.campaigns-panel .campaign-face').length).toBe(5);
      const rows = [...document.querySelectorAll<HTMLElement>('.campaigns-panel .campaign-row')];
      const [withParty, withoutParty] = [rows[0]!, rows[1]!];
      expect(withParty.getBoundingClientRect().height).toBeCloseTo(withoutParty.getBoundingClientRect().height, 0);
      expect(withParty.getBoundingClientRect().height).toBeCloseTo(query('.recent-scenes .dashboard-row').getBoundingClientRect().height, 0);

      // Measured by layout boxes, which the fan's turn leaves alone.
      const boxes = (selector: string): DOMRect[] => [...withParty.querySelectorAll<HTMLElement>(selector)].map((face) => {
        const saved = face.style.transform;
        face.style.transform = 'none';
        const box = face.getBoundingClientRect();
        face.style.transform = saved;
        return box;
      });
      const fan = boxes('.campaign-party__fan .campaign-face');
      const side = boxes('.campaign-party__row .campaign-face');
      expect(fan).toHaveLength(3);
      expect(side).toHaveLength(2);
      for (let index = 1; index < fan.length; index += 1) expect(fan[index]!.left).toBeLessThan(fan[index - 1]!.right - 8);
      expect(side[1]!.left).toBeGreaterThanOrEqual(side[0]!.right);
      expect(side[0]!.left).toBeGreaterThanOrEqual(fan[2]!.right);
      // Turned, not just shifted: the first and last ringed faces lean apart.
      const turns = [...withParty.querySelectorAll<HTMLElement>('.campaign-party__fan .campaign-face')].map((face) => getComputedStyle(face).transform);
      expect(turns[0]).not.toBe(turns[2]);
      // The faces end at the row's inner edge, after the row's text.
      const content = withParty.querySelector('.dashboard-row__content')!.getBoundingClientRect();
      expect(fan[0]!.left).toBeGreaterThanOrEqual(content.right);
      expect(side[1]!.right).toBeCloseTo(withParty.getBoundingClientRect().right - 8, 0);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await shot(`party-${theme}`);

      // The page shows the same party, larger, beside the play control.
      fireEvent.click(withParty);
      await expect.poll(() => document.querySelectorAll('.campaign-page .campaign-face').length).toBe(5);
      fireEvent.click(buttonNamed('Play'));
      await expect.poll(() => document.querySelector('.campaign-page .campaign-playing')).not.toBeNull();
      const play = query('.campaign-page__play').getBoundingClientRect();
      expect(query('.campaign-page .campaign-face').offsetHeight).toBe(44);
      expect(play.height).toBe(44);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await shot(`page-playing-${theme}`);
      fireEvent.click(buttonNamed('Stop'));
    });
  }

  it('lays the search out as a field of the control height across the panel', async () => {
    await mount('dark', campaignsOf);
    const field = query('.campaigns-search .atlas-asset-manager-search').getBoundingClientRect();
    const panel = query('.campaigns-panel').getBoundingClientRect();
    expect(field.height).toBeCloseTo(30, 0);
    expect(field.left).toBeCloseTo(panel.left + 1 + 12, 0);
    expect(field.right).toBeCloseTo(panel.right - 1 - 12, 0);
    fireEvent.change(query('.campaigns-search input'), { target: { value: 'wither' } });
    await expect.poll(() => document.querySelectorAll('.campaigns-panel .campaign-row').length).toBe(1);
    await shot('search-dark');
  });

  it('shows the empty state, then the new campaign field with its error', async () => {
    await mount('dark');
    await shot('empty-dark');
    fireEvent.click(buttonNamed('New campaign'));
    const input = query('.campaign-new__input') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    await expect.poll(() => document.querySelector('.campaign-field-error')?.textContent).toBe('Enter a name');
    await shot('new-dark');
  });
});
