import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Graphics, Text } from 'pixi.js';
import { RemoteMeasures, type MeasureRules, type RemoteMeasure } from '../../../../src/app/online/marks/RemoteMeasures.ts';
import { formatDistance, resolveMeasurementSettings } from '../../../../src/app/grid/measurementFormat';
import type { SharedMeasure } from '../../../../src/app/online/protocol/index.ts';

const INTERVAL = 33;
const FRAME = 25 / 3;
const ANA = 'a'.repeat(20);
const GRID = { type: 'square', size: 70, offsetX: 0, offsetY: 0 } as const;
const RULES: MeasureRules = { grid: GRID, measurement: resolveMeasurementSettings(undefined, null) };
const line = (bx: number, ax = 0): SharedMeasure => ({ shape: 'line', a: [ax, 0], b: [bx, 0] });
const measure = (live: SharedMeasure | null, kept: readonly SharedMeasure[] = []): RemoteMeasure => ({ who: ANA, color: '#66ffa9', live, kept });

describe('RemoteMeasures', () => {
  let measures: RemoteMeasures;
  /** The labels drawn, in the order of their measurements: where each stands and what it says. */
  const labels = (): { x: number; text: string }[] => measures.container.children.filter((child): child is Text => child instanceof Text).map((text) => ({ x: text.position.x, text: text.text }));
  /** Draws a frame every `FRAME` ms from `from` to `to`; returns where the last label stood in each. */
  const run = (from: number, to: number): { x: number; text: string }[] => {
    const seen: { x: number; text: string }[] = [];
    for (let now = from; now <= to; now += FRAME) {
      measures.tick(now);
      const last = labels().at(-1);
      if (last !== undefined) seen.push(last);
    }
    return seen;
  };

  beforeEach(() => {
    // jsdom cannot measure text; a label's size plays no part in where it stands.
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 18));
    measures = new RemoteMeasures(() => 1, () => RULES, INTERVAL);
  });

  afterEach(() => {
    measures.destroy();
    vi.restoreAllMocks();
  });

  it('moves the end being dragged between two messages, and its label with it', () => {
    measures.update([measure(line(0))], 0);
    expect(labels()).toHaveLength(1);
    run(0, 33);
    measures.update([measure(line(700))], 33);
    const seen = run(33, 200);
    const places = seen.map((label) => label.x);
    expect(places.every((x, index) => index === 0 || x >= (places[index - 1] ?? 0))).toBe(true);
    expect(new Set(places.filter((x) => x > 0 && x < 350)).size).toBeGreaterThan(2);
    expect(places.at(-1)).toBe(350);
    // The distance is the drawn end's, not the last message's.
    expect(new Set(seen.map((label) => label.text)).size).toBeGreaterThan(2);
    expect(seen.at(-1)?.text).toBe(formatDistance(10, RULES.measurement));
    expect(measures.busy).toBe(false);
  });

  it('says it is busy while an end still moves', () => {
    measures.update([measure(line(0))], 0);
    run(0, 66);
    expect(measures.busy).toBe(false);
    measures.update([measure(line(700))], 66);
    expect(measures.busy).toBe(true);
    measures.tick(75);
    expect(measures.busy).toBe(true);
  });

  it('starts a new measurement where it begins, without gliding from the last one', () => {
    measures.update([measure(line(700))], 0);
    run(0, 100);
    measures.update([measure(line(1400, 1400))], 100);
    const places = new Set(run(100, 200).map((label) => label.x));
    expect(places).toEqual(new Set([1400]));
  });

  it('shows kept measurements at once, and a kept one in place of the one it was drawn as', () => {
    measures.update([measure(null, [line(140)])], 0);
    expect(labels()).toEqual([{ x: 70, text: formatDistance(2, RULES.measurement) }]);
    measures.update([measure(line(0, 0), [line(140)])], 10);
    run(10, 60);
    measures.update([measure(line(700, 0), [line(140)])], 60);
    measures.update([measure(null, [line(140), line(700)])], 70);
    expect(labels().map((label) => label.x)).toEqual([70, 350]);
    expect(measures.busy).toBe(false);
  });

  it('draws nothing anew for a sender whose measurements did not change', () => {
    measures.update([measure(line(700), [line(140)])], 0);
    run(0, 100);
    const cleared = vi.spyOn(Graphics.prototype, 'clear');
    measures.update([measure(line(700), [line(140)])], 100);
    expect(cleared).not.toHaveBeenCalled();
    measures.update([measure(line(700), [line(140), line(280)])], 110);
    expect(cleared).toHaveBeenCalled();
    expect(labels().map((label) => label.x)).toEqual([70, 140, 350]);
  });

  it('forgets a sender who has no measurements left or is not named', () => {
    measures.update([measure(line(700))], 0);
    measures.update([measure(null)], 10);
    expect(measures.container.children).toHaveLength(0);
    measures.update([measure(line(700))], 20);
    measures.update([], 30);
    expect(measures.container.children).toHaveLength(0);
  });
});
