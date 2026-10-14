import '../../../../../../tests/setup/obsidianDom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../../../types';
import type { LevelSurface } from '../../../../types/sceneLevelTypes';
import { LEVELS, openLevelsView, paintedTexture, worldOf, type LevelsView } from './levelsHarness';

vi.mock('events', async () => import('eventemitter3'));

const MAP = 512;
const PANE = 256;
const rect = (x: number, y: number, w: number, h: number): LevelSurface['polygon'] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const viewer = (id: string, x: number, y: number, level = 'upper'): TokenEntity => ({ id, kind: 'token', x, y, imagePath: '', level, vision: { enabled: true } }) as TokenEntity;

/** A pixel shows the level below's magenta: red and blue far above green. */
const magenta = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o]! > pixels[o + 1]! + 60 && pixels[o + 2]! > pixels[o + 1]! + 60;

/** Sets the scene, and waits until the level below's image is in and its picture built. */
async function scene(view: LevelsView, surfaces: Record<string, LevelSurface>, tokens: Record<string, TokenEntity>, ambient = 1): Promise<void> {
  const { store } = view;
  store.setState({
    mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper',
    objects: { ...store.getState().objects, tokens, levelSurfaces: surfaces },
  });
  store.getState().setSceneLighting({ enabled: true, ambient });
  await view.settle();
}

describe('levels below through openings, in a lit view', () => {
  const views: LevelsView[] = [];
  afterEach(() => {
    while (views.length) views.pop()!.dispose();
  });

  it('shows the level below in an opening where the party sees, and the viewed level everywhere else', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(100, 100, 200, 200) } }, { v: viewer('v', 60, 60) });
    const scale = PANE / MAP;
    const frame = view.playerFrame(scale, 0, 0);
    let inside = 0;
    let shown = 0;
    let outside = 0;
    let leaked = 0;
    for (let sy = 0; sy < PANE; sy++) {
      for (let sx = 0; sx < PANE; sx++) {
        const p = worldOf(sx, sy, 1, scale, 0, 0);
        const o = (sy * PANE + sx) * 4;
        const hole = p.x > 104 && p.x < 296 && p.y > 104 && p.y < 296;
        const floor = p.x < 96 || p.x > 304 || p.y < 96 || p.y > 304;
        if (hole) {
          inside++;
          if (magenta(frame, o)) shown++;
        } else if (floor) {
          outside++;
          if (magenta(frame, o)) leaked++;
        }
      }
    }
    expect(inside).toBeGreaterThan(5000);
    expect(shown).toBe(inside);
    expect(leaked).toBe(0);
  });

  it('shows nothing below without an opening, and the level below only once its picture is ready', async () => {
    const view = await openLevelsView({ map: MAP, pane: PANE });
    views.push(view);
    await scene(view, {}, { v: viewer('v', 60, 60) });
    const frame = view.playerFrame(PANE / MAP, 0, 0);
    let magentaPixels = 0;
    for (let o = 0; o < frame.length; o += 4) if (magenta(frame, o)) magentaPixels++;
    expect(magentaPixels).toBe(0);
  });

  it('draws each picture\'s level below through that picture\'s own camera', async () => {
    // Magenta on the left half of the level below, teal on the right.
    const halves = paintedTexture(MAP, MAP, (x) => (x < MAP / 2 ? [220, 30, 220] : [30, 200, 200]));
    const view = await openLevelsView({ map: MAP, pane: PANE, below: halves });
    views.push(view);
    await scene(view, { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: rect(0, 0, 512, 512) } }, { v: viewer('v', 60, 60) });
    // The players' frame looks at the left half, the GM's canvas then at the right half.
    const players = view.playerFrame(1, 0, 0);
    const gm = view.gmCanvas(1, -256, 0);
    const count = (pixels: Uint8ClampedArray, test: (o: number) => boolean): number => {
      let n = 0;
      for (let o = 0; o < pixels.length; o += 4) if (test(o)) n++;
      return n;
    };
    const teal = (pixels: Uint8ClampedArray, o: number): boolean => pixels[o + 1]! > pixels[o]! + 60 && pixels[o + 2]! > pixels[o]! + 60;
    const all = PANE * PANE;
    expect(count(players, (o) => magenta(players, o))).toBeGreaterThan(all * 0.95);
    expect(count(gm, (o) => teal(gm, o))).toBeGreaterThan(all * 0.95);
    expect(count(gm, (o) => magenta(gm, o))).toBe(0);
  });
});
