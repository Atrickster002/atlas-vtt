import '../setup/obsidianDom';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import type { StoredCampaign } from '../../src/app/campaigns/campaignTypes';
import { AssetService } from '../../src/app/services/AssetService';
import { DASHBOARD_THEME as THEME } from './dashboardTheme';
import { DAY, forceState, mountDashboard, query, queryAll, settle, shot } from './dashboardHarness';

vi.mock('events', async () => import('eventemitter3'));
// A map's sharp picture comes from its tile pyramid; here it is the painted picture itself.
vi.mock('../../src/app/react/components/dashboard/mapPicture', () => ({
  mapPictureUrl: (app: App, path: string): Promise<string | null> => {
    const file = app.vault.getFileByPath(path);
    return Promise.resolve(file ? app.vault.getResourcePath(file) : null);
  },
  releaseMapPictures: (): void => undefined,
}));

/**
 * A campaign's page laid out by the plugin's stylesheet: its world map behind the head of the page,
 * fading into the page, and the world map card in its states. Screenshots go to `__screenshots__`.
 */

const DESCRIPTION = 'Blue Mouth Caves, below the Hollow Oak. The olms rise when the river runs red.';

function campaigns(worldMap: 'scene' | 'map' | 'none') {
  return ({ scenes, maps }: { scenes: Map<string, string>; maps: Map<string, string> }): StoredCampaign[] => [{
    id: 'a',
    name: 'Rise of the Blood Olms',
    createdAt: Date.now() - 30 * DAY,
    lastPlayed: Date.now() - 2 * DAY,
    description: DESCRIPTION,
    ...(worldMap === 'scene' && { worldMap: scenes.get('Blue Mouth Caves')! }),
    ...(worldMap === 'map' && { worldMap: maps.get('The Wide World')! }),
  }];
}

async function openPage(): Promise<void> {
  await expect.poll(() => document.querySelector('.campaign-card')).not.toBeNull();
  fireEvent.click(query('.campaign-card'));
  await expect.poll(() => document.querySelector('.campaign-page')).not.toBeNull();
}

const box = (element: Element): DOMRect => element.getBoundingClientRect();
const pictureShown = (selector: string) => (): number => (document.querySelector<HTMLImageElement>(`${selector} .atlas-map-art__sharp[data-shown]`)?.naturalWidth ?? 0);

describe('a campaign\'s page', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(() => {
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
    AssetService.resetInstance();
    vi.restoreAllMocks();
  });

  for (const theme of ['dark', 'light'] as const) {
    for (const size of [{ width: 1600, height: 1000 }, { width: 800, height: 1000 }]) {
      it(`shows the world map behind its head, fading into the page (${theme}, ${size.width})`, async () => {
        await mountDashboard(theme, campaigns('scene'), { size });
        await openPage();
        await expect.poll(pictureShown('.campaign-backdrop')).toBeGreaterThan(0);
        await expect.poll(pictureShown('.world-map-card')).toBeGreaterThan(0);

        // The backdrop spans the pane, behind the name, and fades out to nothing at its foot.
        const backdrop = query('.campaign-backdrop');
        const view = box(query('.atlas-dashboard-view'));
        expect(box(backdrop).width).toBeCloseTo(view.width - (view.width - query('.atlas-dashboard').clientWidth), 0);
        const mask = getComputedStyle(backdrop).maskImage;
        expect(mask).toMatch(/^linear-gradient\(rgb\(0, 0, 0\) 0%/);
        expect(mask).toMatch(/(transparent|rgba\(0, 0, 0, 0\)) 100%\)$/);
        const name = box(query('.campaign-name__input'));
        expect(name.top).toBeGreaterThan(box(backdrop).top + 60);
        expect(name.bottom).toBeLessThan(box(backdrop).bottom);
        // Behind the page's content, never over it.
        expect(Number(getComputedStyle(backdrop).zIndex)).toBeLessThan(0);

        // Wide panes put the world map beside the description; narrow ones above it.
        const card = box(query('.world-map-card'));
        const description = box(query('.campaign-description'));
        if (size.width > 1000) expect(card.left).toBeGreaterThan(description.right);
        else expect(card.bottom).toBeLessThan(description.top);
        // The world map is large: 4:3 across the side column, 16:9 across a narrow pane.
        const art = box(query('.world-map-card__art'));
        expect(art.width).toBeGreaterThanOrEqual(300);
        expect(art.width / art.height).toBeCloseTo(size.width > 1000 ? 4 / 3 : 16 / 9, 1);
        expect(document.querySelector('.atlas-dashboard-view')!.scrollWidth).toBeLessThanOrEqual(size.width);
        await settle(1000);
        await shot(`page-${theme}-${size.width}`);
      });
    }

    it(`marks the world map card on hover and press, and names what a press does (${theme})`, async () => {
      await mountDashboard(theme, campaigns('scene'));
      await openPage();
      await expect.poll(pictureShown('.world-map-card')).toBeGreaterThan(0);
      const open = query('.world-map-card__open');
      expect(open.textContent).toBe('Place pins');
      expect(open.getAttribute('aria-labelledby')?.split(' ')).toHaveLength(2);
      const ring = (): string => getComputedStyle(open, '::after').boxShadow;
      expect(ring()).not.toContain('inset 0px 0px 0px 2px');
      const restingAction = getComputedStyle(query('.world-map-card__action')).backgroundColor;
      await settle(300);
      await shot(`world-map-card-rest-${theme}`, query('.world-map-card'));

      let release = await forceState(open, ['hover']);
      await settle(700);
      expect(ring()).toContain('2px');
      // What a press does turns the accent of Play.
      expect(getComputedStyle(query('.world-map-card__action')).backgroundColor).not.toBe(restingAction);
      expect(getComputedStyle(query('.world-map-card__action')).backgroundColor).toBe(getComputedStyle(query('.campaign-hero__play')).backgroundColor);
      expect(getComputedStyle(query('.world-map-card__art img')).transform).not.toBe('none');
      await shot(`world-map-card-hover-${theme}`, query('.world-map-card'));
      await release();

      release = await forceState(open, ['hover', 'active']);
      await settle(200);
      expect(ring()).toContain('3px');
      expect(getComputedStyle(open).transform).toMatch(/^matrix\(0\.98/);
      await shot(`world-map-card-pressed-${theme}`, query('.world-map-card'));
      await release();
    });

    it(`offers to choose a world map, and shows the chosen one at once (${theme})`, async () => {
      const { storage, mapIds } = await mountDashboard(theme, campaigns('none'));
      await openPage();
      await expect.poll(() => document.querySelector('.world-map-card__choose')).not.toBeNull();
      expect(query('.world-map-card__choose').textContent).toBe('Choose a world map');
      expect(query('.campaign-page').hasAttribute('data-backdrop')).toBe(false);
      await settle();
      await shot(`page-without-world-map-${theme}`);

      fireEvent.click(query('.world-map-card__choose'));
      await expect.poll(() => queryAll('.world-map-picker__option').length).toBe(4);
      await settle(250);
      await shot(`world-map-picker-${theme}`);
      fireEvent.click(queryAll('.world-map-picker__option').find((option) => option.textContent?.includes('The Wide World'))!);
      expect(storage.current()[0]!.worldMap).toBe(mapIds.get('The Wide World'));
      await expect.poll(() => document.querySelector('.world-map-card__open')).not.toBeNull();
      // A plain map is made a scene before its pins can be placed.
      expect(query('.world-map-card__open').textContent).toBe('Make it a scene to place pins');
      expect(query('.world-map-card__kind').textContent).toBe('Map');
      await expect.poll(pictureShown('.campaign-backdrop')).toBeGreaterThan(0);

      // Remove gives the card back its offer.
      act(() => fireEvent.click(query('.world-map-card__remove')));
      expect(storage.current()[0]).not.toHaveProperty('worldMap');
      await expect.poll(() => document.querySelector('.world-map-card__choose')).not.toBeNull();
    });
  }

  it('holds the world map card\'s place with its shape while the maps are read', async () => {
    let finish: () => void = () => undefined;
    const getAssets = AssetService.prototype.getAssets;
    await mountDashboard('dark', campaigns('scene'));
    await openPage();
    await expect.poll(() => document.querySelector('.world-map-card__open')).not.toBeNull();
    const shown = box(query('.world-map-card__frame'));
    cleanup();
    const holdMaps = (): void => {
      vi.spyOn(AssetService.prototype, 'getAssets').mockImplementation(function (this: AssetService, ...args: Parameters<AssetService['getAssets']>) {
        if (args[1] === 'map') return new Promise((resolve) => { finish = () => resolve(getAssets.apply(this, args)); });
        return getAssets.apply(this, args);
      });
    };
    await mountDashboard('dark', campaigns('scene'), { beforeRender: holdMaps });
    await openPage();
    await expect.poll(() => document.querySelector('.world-map-card .atlas-skeleton-group')).not.toBeNull();
    const placeholder = box(query('.world-map-card__frame'));
    expect(placeholder.width).toBeCloseTo(shown.width, 0);
    expect(placeholder.height).toBeCloseTo(shown.height, 0);
    await settle(600);
    await shot('world-map-card-loading-dark', query('.world-map-card'));
    finish();
  });
});
