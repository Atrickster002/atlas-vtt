import '../setup/obsidianDom';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { TFile } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { QuestIndex } from '../../src/app/campaigns/quests/QuestIndex';
import { AssetService } from '../../src/app/services/AssetService';
import { mapThumbnailPath } from '../../src/app/utils/dataFileMigration';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { questVault } from '../mocks/questVault';
import { DASHBOARD_THEME } from './dashboardTheme';

const WORLD_MAP = 'atlas-vtt/assets/The Wide World.webp';
// The campaign's page reaches services that load Node's events module.
vi.mock('events', async () => import('eventemitter3'));
vi.mock('../../src/app/services/worldMap', () => ({ campaignWorldMap: () => Promise.resolve('atlas-vtt/assets/The Wide World.webp') }));

import { Dashboard } from '../../src/app/react/components/dashboard/Dashboard';

/**
 * The quests of a campaign's page, laid out by the plugin's stylesheet over Obsidian's default
 * theme variables (light and dark). Each test saves screenshots in `__screenshots__` for a look by eye.
 */

const SCENE_PATH = 'atlas-vtt/collections/Cairn/scenes/Blue Mouth Caves.atlasmap';
const CAMPAIGN = 'Rise of the Blood Olms';

const quest = (properties: string, body = 'The olms rise when the river runs red.'): string => `---\natlas-type: quest\ncampaign: ${CAMPAIGN}\n${properties}\n---\n${body}\n`;
const QUESTS: Record<string, string> = {
  'Quests/The crown under the root.md': quest('kind: main\nstatus: active\nexperience: 1200\nrewards: [Favour of the Horned King, A seat at the Hollow Oak]\nplace: { x: 0.32, y: 0.41 }'),
  "Quests/Rescue the miller's daughter.md": quest('kind: main\nstatus: open\nexperience: 400'),
  'Quests/Olm eggs for the alchemist.md': quest('kind: side\nstatus: open\nexperience: 150\nrewards: [3 gold pieces]'),
  "Quests/The sexton's ledger.md": quest('kind: side\nstatus: active'),
  'Quests/Clear the cellar.md': quest('kind: main\nstatus: done\nexperience: 100'),
  'Quests/Save the ferryman.md': quest('kind: side\nstatus: failed'),
};

/** A painted world map: sea, two lands and a river. */
function worldPicture(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 400;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'hsl(205, 35%, 55%)';
  context.fillRect(0, 0, 600, 400);
  context.fillStyle = 'hsl(85, 30%, 58%)';
  context.beginPath();
  context.ellipse(220, 180, 190, 130, -0.3, 0, Math.PI * 2);
  context.ellipse(470, 290, 110, 80, 0.4, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'hsl(205, 45%, 45%)';
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(120, 90);
  context.quadraticCurveTo(230, 200, 330, 320);
  context.stroke();
  return canvas.toDataURL();
}

const opened: unknown[] = [];

async function mount(theme: 'light' | 'dark'): Promise<void> {
  document.body.className = `theme-${theme}`;
  const vault = questVault({
    [SCENE_PATH]: JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: SCENE_PATH, objects: {} } }),
    [mapThumbnailPath(SCENE_PATH)]: 'JPG',
    [WORLD_MAP]: 'WEBP',
    ...QUESTS,
  });
  const { app } = vault;
  const world = worldPicture();
  vi.mocked(app.vault.getResourcePath).mockImplementation((file: TFile) => (file.path === WORLD_MAP ? world : ''));
  QuestIndex.open(app);
  opened.push(app);
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const [scene] = await assets.getAssets(undefined, 'scene');
  const storage = memoryCampaigns([{ id: 'a', name: CAMPAIGN, createdAt: Date.now() - 1e9, lastPlayed: Date.now() - 2e8, worldMap: scene!.id, description: 'Blue Mouth Caves, below the Hollow Oak.' }]);
  render(
    React.createElement('div', { className: 'workspace-leaf-content atlas-dashboard-view atlas-vtt-plugin' },
      React.createElement(Dashboard, { app, campaignStorage: storage, onOpenScene: vi.fn(), onCreateMap: vi.fn(), onOpenAssetManager: vi.fn() })),
  );
  await expect.poll(() => document.querySelector('.campaigns-panel .dashboard-row')).not.toBeNull();
  fireEvent.click(query('.campaigns-panel .dashboard-row'));
  await expect.poll(() => document.querySelectorAll('.campaign-quest').length).toBe(4);
}

const query = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;
/** The row of the quest with this title. */
const rowOf = (title: string): HTMLElement => [...document.querySelectorAll<HTMLElement>('.campaign-quest')].find((row) => row.querySelector('.campaign-quest__title')?.textContent === title)!;
const CROWN = 'The crown under the root';
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 250));

describe('the quests of a campaign\'s page', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css;

  beforeEach(async () => {
    await page.viewport(1280, 860);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
    for (const app of opened.splice(0)) QuestIndex.release(app as Parameters<typeof QuestIndex.release>[0]);
    AssetService.resetInstance();
    vi.restoreAllMocks();
  });

  for (const theme of ['dark', 'light'] as const) {
    it(`lists the quests in groups with even padding, every control on one line (${theme})`, async () => {
      await mount(theme);
      const panel = query('.campaign-quests__panel');
      const box = panel.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(panel).borderLeftWidth);
      const groups = [...panel.querySelectorAll<HTMLElement>('.campaign-quests__group')];
      // As much space inside the border as between the groups.
      expect(groups[0]!.getBoundingClientRect().top - box.top - border).toBeCloseTo(8, 0);
      expect(groups[1]!.getBoundingClientRect().top - groups[0]!.getBoundingClientRect().bottom).toBeCloseTo(8, 0);
      expect(box.bottom - border - groups.at(-1)!.getBoundingClientRect().bottom).toBeCloseTo(8, 0);
      // Status controls share one column, place buttons end every row at the same edge.
      const rows = [...panel.querySelectorAll<HTMLElement>('.campaign-quest')];
      const statusLefts = rows.map((row) => row.querySelector('.atlas-select-trigger')!.getBoundingClientRect().left);
      const placeRights = rows.map((row) => row.querySelector('.quest-place__trigger')!.getBoundingClientRect().right);
      for (const left of statusLefts) expect(left).toBeCloseTo(statusLefts[0]!, 0);
      for (const right of placeRights) expect(right).toBeCloseTo(placeRights[0]!, 0);
      expect(rowOf(CROWN).querySelector('.quest-place__trigger')!.classList.contains('is-placed')).toBe(true);
      expect(rows.filter((row) => row.querySelector('.is-placed'))).toHaveLength(1);
      await settle();
      await page.screenshot({ path: `__screenshots__/atlas-quests-${theme}.png`, element: query('.campaign-quests') });

      fireEvent.click(query('.campaign-quests__fold'));
      await expect.poll(() => document.querySelectorAll('.campaign-quest').length).toBe(6);
      await settle();
      await page.screenshot({ path: `__screenshots__/atlas-quests-unfolded-${theme}.png`, element: query('.campaign-quests') });
    });

    it(`opens the world map of a quest with the map inset like its close button (${theme})`, async () => {
      await mount(theme);
      const trigger = rowOf(CROWN).querySelector<HTMLElement>('.quest-place__trigger')!;
      trigger.scrollIntoView({ block: 'start' });
      await expect.poll(() => trigger.getAttribute('aria-disabled')).toBeNull();
      fireEvent.click(trigger);
      await expect.poll(() => (document.querySelector<HTMLImageElement>('.quest-place__map img')?.naturalWidth ?? 0) > 0).toBe(true);
      await settle();
      const panel = query('.quest-place__panel');
      const box = panel.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(panel).borderLeftWidth);
      const map = query('.quest-place__map').getBoundingClientRect();
      const close = query('.quest-place__header .atlas-close-btn').getBoundingClientRect();
      expect(map.left - box.left - border).toBeCloseTo(8, 0);
      expect(box.right - border - map.right).toBeCloseTo(8, 0);
      expect(box.bottom - border - map.bottom).toBeCloseTo(8, 0);
      expect(box.right - border - close.right).toBeCloseTo(8, 0);
      expect(close.top - box.top - border).toBeCloseTo(8, 0);
      // The image keeps its proportions, so a share of it is a share of the map players see.
      expect(map.width / map.height).toBeCloseTo(600 / 400, 1);
      // The pin stands where the note says, its point on the place.
      const pin = query('.quest-place__pin').getBoundingClientRect();
      expect((pin.left + pin.right) / 2).toBeCloseTo(map.left + 0.32 * map.width, 0);
      expect(pin.bottom).toBeCloseTo(map.top + 0.41 * map.height, 0);
      (document.activeElement as HTMLElement | null)?.blur();
      await settle();
      await page.screenshot({ path: `__screenshots__/atlas-quest-place-${theme}.png`, element: panel });
    });
  }
});
