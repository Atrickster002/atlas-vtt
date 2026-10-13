import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { renderPane, type PaneHarness } from '../unit/statblocks/editor/paneKit';
import { centreOf, mouse } from './realMouse';
import { frames, useEditorStyles } from './sidePanesHarness';

// Dice links and the token socket reach the map view and the token link service, whose Node `events` has no browser build.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
  splitDiceSegments: (text: string) => [{ text, dice: false }],
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/statblocks/editor/create/createFlow', () => ({
  createStatblock: async () => null,
  startStatblockCreation: async () => null,
}));
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const WARDEN = { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden', hp: 14 };
const INSET = 4;
/** The card's border as the stylesheet sets it; at a pixel ratio of 1 the browser draws it 1 px, so places may differ by half a pixel. */
const BORDER = 1.5;
const ROUNDING = 0.6;

const apps: App[] = [];
afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

/** The pane in the plugin's scope, 480 px wide, as the panel beside a note holds it. */
async function pane(): Promise<PaneHarness> {
  document.querySelectorAll('.atlas-test-pane').forEach((host) => host.remove());
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin atlas-test-pane' }));
  container.style.width = '480px';
  const harness = await renderPane({ frontmatter: WARDEN, container, actions: { showProperties: vi.fn(), changeCollection: vi.fn(), editTemplate: vi.fn() } });
  apps.push(harness.app);
  await frames(2);
  return harness;
}

const opacityOf = (element: Element): number => Number(getComputedStyle(element).opacity);

/** The statblock's ⋯ in its card's corner (§7.2). */
describe('the statblock\'s options in its card\'s corner', () => {
  useEditorStyles();

  it('stands concentric in the card\'s top-right corner, clear of the token art, and shows only while the pointer is over the card', async () => {
    const harness = await pane();
    const card = harness.result.container.querySelector<HTMLElement>('.atlas-sb-pane-card')!;
    const menu = card.querySelector<HTMLElement>('.atlas-sb-card-menu')!;
    const button = menu.querySelector<HTMLElement>('button')!;
    const surface = card.querySelector<HTMLElement>('.atlas-statblock')!;
    const sheet = surface.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    expect(Math.abs(sheet.right - box.right - (BORDER + INSET))).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(box.top - sheet.top - (BORDER + INSET))).toBeLessThanOrEqual(ROUNDING);
    // Concentric with the card's corner: the card's inner radius less the inset.
    const outer = Number.parseFloat(getComputedStyle(surface).borderTopRightRadius);
    expect(Math.abs(Number.parseFloat(getComputedStyle(button).borderTopRightRadius) - (outer - BORDER - INSET))).toBeLessThanOrEqual(ROUNDING);
    const socket = card.querySelector('.atlas-sb-token-socket, .atlas-sb-token-image')!.getBoundingClientRect();
    expect(box.left - socket.right).toBeGreaterThanOrEqual(INSET - 0.5);

    expect(opacityOf(menu)).toBe(0);
    await act(async () => {
      await mouse.move(centreOf(card).x, centreOf(card).y);
      await frames(12);
    });
    expect(opacityOf(menu)).toBe(1);
    await page.screenshot({ element: card, path: '__screenshots__/card-menu/corner.png' });
  });
});
