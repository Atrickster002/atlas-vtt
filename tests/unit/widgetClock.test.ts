import { describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { parseUserPresets } from '../../src/app/gameSystems/presetValidation';
import { pickLibraryWidgets, withCollectionWidgets } from '../../src/app/utils/collectionWidgets';
import { clampCounterValue, stepCounter } from '../../src/app/utils/counterWidget';
import { CLOCK_VIEW_SIZE, clockFace, clockValueForWedge, isValidClockSegments } from '../../src/app/utils/clockWidget';
import type { ClockWidget } from '../../src/app/types/widgetTypes';

const alarm: ClockWidget = {
  id: 'alarm', type: 'clock', label: 'Alarm', icon: 'skull', segments: 6,
  visible: true, visibleToPlayers: true, value: 0, order: 0,
};

describe('clock face', () => {
  it('draws one wedge per segment, clockwise from twelve o\'clock', () => {
    const { wedges, count } = clockFace(4, 1, false);
    expect(count).toBeNull();
    const centre = CLOCK_VIEW_SIZE / 2;
    const radius = centre - 1;
    expect(wedges).toHaveLength(4);
    expect(wedges[0]).toBe(`M ${centre} ${centre} L ${centre} ${centre - radius} A ${radius} ${radius} 0 0 1 ${centre + radius} ${centre} Z`);
    expect(wedges[3]).toMatch(new RegExp(`A ${radius} ${radius} 0 0 1 ${centre} ${centre - radius} Z$`));
  });

  it('turns into a ring with the count in its centre, sized to fit the hole', () => {
    const { wedges, count } = clockFace(6, 3, true);
    expect(wedges).toHaveLength(6);
    // Ring sectors run back along an inner arc instead of meeting in the centre.
    expect(wedges.every((path) => !path.startsWith(`M ${CLOCK_VIEW_SIZE / 2} ${CLOCK_VIEW_SIZE / 2}`) && path.match(/ A /g)?.length === 2)).toBe(true);
    expect(count?.text).toBe('3/6');

    const long = clockFace(12, 12, true).count!;
    expect(long.text).toBe('12/12');
    expect(long.fontSize).toBeLessThan(count!.fontSize);
  });

  it('fills up to a clicked wedge and empties the last filled one', () => {
    expect(clockValueForWedge(3, 1)).toBe(4);
    expect(clockValueForWedge(0, 4)).toBe(1);
    expect(clockValueForWedge(3, 4)).toBe(3);
    expect(clockValueForWedge(0, 1)).toBe(0);
  });

  it('accepts whole segment counts from 2 to 12', () => {
    expect([2, 4, 12].every(isValidClockSegments)).toBe(true);
    expect([1, 13, 4.5, '4', undefined].some(isValidClockSegments)).toBe(false);
  });
});

describe('clock values', () => {
  it('runs from empty to full', () => {
    expect(clampCounterValue(alarm, -1)).toBe(0);
    expect(clampCounterValue(alarm, 9)).toBe(6);
  });

  it('steps within its segments through the undo-tracked widget values', () => {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'clock-steps');
    store.getState().addWidget({ ...alarm, value: 5 });
    store.getState().setWidgetValue(alarm.id, 5);

    stepCounter(store, alarm.id, 1);
    stepCounter(store, alarm.id, 1);
    expect(store.getState().widgetValues.alarm).toBe(6);

    store.getState().updateWidget(alarm.id, { segments: 4 });
    stepCounter(store, alarm.id, 0);
    expect(store.getState().widgetValues.alarm).toBe(4);
  });

  it('shares its current value with the collection like a counter', () => {
    const shared = { ...alarm, scope: 'collection' as const };
    expect(pickLibraryWidgets({ widgets: { alarm: shared }, widgetValues: { alarm: 3 } }).alarm?.value).toBe(3);
    expect(withCollectionWidgets({ widgets: {}, widgetValues: {} }, { alarm: { ...shared, value: 2 } }).widgetValues.alarm).toBe(2);
  });
});

describe('clocks in stored presets', () => {
  const presetWith = (widgets: unknown[]): unknown[] => [{
    id: 'p1',
    name: 'Heist',
    rules: { gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, conditions: [], widgets },
  }];

  it('keeps clocks with a usable segment count and value', () => {
    const [preset] = parseUserPresets(presetWith([
      { ...alarm, value: 2, showCount: 'yes' },
      { ...alarm, id: 'counted', showCount: true },
      { ...alarm, id: 'no-segments', segments: undefined },
      { ...alarm, id: 'overfilled', value: 7 },
    ]));
    expect(preset?.rules.widgets).toEqual([
      { ...alarm, value: 2, scope: 'collection' },
      { ...alarm, id: 'counted', showCount: true, scope: 'collection' },
    ]);
  });
});
