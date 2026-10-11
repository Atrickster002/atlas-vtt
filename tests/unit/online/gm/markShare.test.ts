// @vitest-environment node
import { MARKS_INTERVAL_MS, type PlayerLaser, type PlayerMeasure } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { checkLaser, checkMeasure, MARKS_PER_SECOND, nearMap, swatchColour } from '../../../../src/app/online/gm/markCheck.ts';
import { LASER_SILENCE_MS } from '../../../../src/app/online/gm/MarkShare.ts';
import { lastMarks, markHarness } from './markHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const MAP = { width: 1000, height: 800 };
const CONTEXT = { scene: 's1', map: MAP };
const laser = (changes: Partial<PlayerLaser> = {}): PlayerLaser => ({ t: 'laser', scene: 's1', color: '#66ffa9', size: 16, at: [100, 100], pts: [100, 100, 110, 100], on: true, ...changes });
const measure = (changes: Partial<PlayerMeasure> = {}): PlayerMeasure => ({ t: 'measure', scene: 's1', color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [80, 10] }, kept: [], ...changes });

describe('checking players\' marks', () => {
  it('takes only the swatches\' colours, as the swatch writes them', () => {
    expect(swatchColour('#66FFA9')).toBe('#66ffa9');
    expect(swatchColour('#66ffaa')).toBeNull();
    expect(checkLaser(laser({ color: '#123456' }), CONTEXT)).toBeNull();
    expect(checkMeasure(measure({ color: '#123456' }), CONTEXT)).toBeNull();
    expect(checkLaser(laser({ color: '#FF9F2E' }), CONTEXT)?.color).toBe('#ff9f2e');
  });

  it('clamps the laser\'s size as Atlas does', () => {
    expect(checkLaser(laser({ size: 1 }), CONTEXT)?.size).toBe(8);
    expect(checkLaser(laser({ size: 900 }), CONTEXT)?.size).toBe(100);
  });

  it('refuses another scene, or none shared', () => {
    expect(checkLaser(laser({ scene: 's2' }), CONTEXT)).toBeNull();
    expect(checkMeasure(measure({ scene: 's2' }), CONTEXT)).toBeNull();
    expect(checkLaser(laser(), { scene: null, map: MAP })).toBeNull();
  });

  it('leaves out points far off the map and any that are not numbers', () => {
    expect(nearMap([Number.NaN, 0], MAP)).toBe(false);
    expect(nearMap([Number.POSITIVE_INFINITY, 0], null)).toBe(false);
    expect(nearMap([-900, 1500], MAP)).toBe(true);
    expect(nearMap([-1100, 0], MAP)).toBe(false);
    expect(checkLaser(laser({ at: [5000, 0], pts: [1, 2, 9000, 2, 3, 4] }), CONTEXT)).toMatchObject({ at: null, pts: [1, 2, 3, 4] });
    const far = { shape: 'circle', a: [0, 0], b: [0, 9000] } as const;
    expect(checkMeasure(measure({ live: far, kept: [far, { shape: 'cone', a: [1, 1], b: [2, 2] }] }), CONTEXT)).toEqual({ color: '#66ffa9', live: null, kept: [{ shape: 'cone', a: [1, 1], b: [2, 2] }] });
  });
});

describe('MarkShare', () => {
  it('passes each player\'s laser and measurements on to all, the GM\'s too, and draws the players\' for the GM', async () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(ANA, laser());
    harness.share.receive(BEN, measure());
    harness.advance(MARKS_INTERVAL_MS);
    harness.laser.at = [5, 5];
    harness.laser.changed();
    await harness.measure({ live: { shape: 'sphere', start: { x: 1, y: 1 }, end: { x: 3, y: 4 } }, kept: [] });
    harness.advance(MARKS_INTERVAL_MS);
    const marks = lastMarks(harness);
    expect(harness.sent.every(({ to }) => to === undefined)).toBe(true);
    expect(marks?.lasers.map((entry) => entry.who)).toEqual(['gm', ANA]);
    expect(marks?.lasers[0]).toMatchObject({ who: 'gm', color: '#ff0059', at: [5, 5], on: false });
    expect(marks?.measures).toEqual([
      { who: 'gm', color: '#123456', live: { shape: 'circle', a: [1, 1], b: [3, 4] }, kept: [] },
      { who: BEN, color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [80, 10] }, kept: [] },
    ]);
    expect(harness.shown?.lasers.map((entry) => entry.who)).toEqual([ANA]);
    expect(harness.shown?.measures.map((entry) => entry.who)).toEqual([BEN]);
  });

  it('sends trail points once and nothing while nothing changes', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(ANA, laser());
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers[0]?.pts).toEqual([100, 100, 110, 100]);
    const count = harness.sent.length;
    harness.share.receive(ANA, laser({ pts: [] }));
    harness.share.update();
    harness.advance(5 * MARKS_INTERVAL_MS);
    expect(harness.sent.length).toBe(count + 1);
    expect(lastMarks(harness)?.lasers[0]?.pts).toEqual([]);
    harness.share.update();
    harness.advance(5 * MARKS_INTERVAL_MS);
    expect(harness.sent.length).toBe(count + 1);
  });

  it('sends at most one marks message every interval, however much arrives', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    const players = Array.from({ length: 6 }, (_, index) => String.fromCharCode(97 + index).repeat(20));
    for (let ms = 0; ms < 3000; ms += 4) {
      for (const player of players) harness.share.receive(player, laser({ at: [ms % 500, 10], pts: [ms % 500, 10] }));
      harness.laser.at = [ms % 700, 20];
      harness.laser.changed();
      harness.advance(4);
    }
    expect(harness.sent.length).toBeGreaterThan(30);
    expect(harness.sent.length).toBeLessThanOrEqual(Math.floor(3000 / MARKS_INTERVAL_MS) + 1);
  });

  it(`drops a player's marks above ${MARKS_PER_SECOND} a second`, () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    for (let index = 0; index < 40; index += 1) harness.share.receive(ANA, laser({ pts: [index, index] }));
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers[0]?.pts.length).toBe(2 * MARKS_PER_SECOND);
  });

  it('forgets a laser that went silent, a player who left and the marks of another scene', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(ANA, laser());
    harness.share.receive(BEN, measure());
    harness.share.receive(BEN, laser({ scene: 'old' }));
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers.map((entry) => entry.who)).toEqual([ANA]);
    harness.advance(LASER_SILENCE_MS + 10);
    harness.share.update();
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers).toEqual([]);
    harness.share.playerLeft(BEN);
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.measures).toEqual([]);
    harness.share.receive(ANA, measure());
    harness.share.setScene('s2');
    harness.advance(MARKS_INTERVAL_MS);
    expect(harness.sent.filter(({ body }) => body.scene === 's2').every(({ body }) => body.measures.length === 0)).toBe(true);
    expect(harness.shown).toEqual({ lasers: [], measures: [] });
  });

  it('sends the last marks to a player who joins', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(BEN, measure());
    harness.advance(MARKS_INTERVAL_MS);
    harness.share.resend(ANA);
    expect(harness.sent.at(-1)).toEqual({ body: lastMarks(harness), to: ANA });
  });
});
