import { describe, expect, it } from 'vitest';
import { beamOf } from '../../src/app/lighting/lightBeam';
import { MAX_LIGHT_ZONES, lightZoneList } from '../../src/app/lighting/lightZones';
import { migrateMapFile } from '../../src/app/services/MapPersistence';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const EMISSION = { bright: 20, dim: 40, color: '#ffffff', intensity: 1, animation: 'none' };
const zone = (id: string, changes: Record<string, unknown> = {}): Record<string, unknown> => ({ id, kind: 'light-zone', polygon: SQUARE, ambient: 0.5, ...changes });
const light = (id: string, changes: Record<string, unknown> = {}): Record<string, unknown> => ({ id, kind: 'light', x: 10, y: 10, emission: EMISSION, ...changes });
const door = (id: string, changes: Record<string, unknown> = {}): Record<string, unknown> => ({ id, kind: 'wall', type: 'door', closed: true, p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, ...changes });

/** The objects of a map file with these in it, as a load brings them into the store. */
function load(objects: Record<string, unknown>): ReturnType<typeof migrateMapFile>['objects'] {
  return migrateMapFile({ schema: 'atlas-map', version: 4, objects: { tokens: {}, ...objects } }).objects;
}

function storeWith(objects: ReturnType<typeof load>): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `lighting-from-file-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ objects });
  return store;
}

describe('light zones read from a map file', () => {
  it.each([['a text', 'text'], ['a number', 5], ['true', true], ['a list', [zone('z')]]])('are none when the file holds %s in their place, and a zone can be drawn afterwards', (_name, value) => {
    const objects = load({ lightZones: value });
    expect(objects.lightZones).toBeUndefined();
    const store = storeWith(objects);
    const id = store.getState().addLightZone({ polygon: SQUARE, ambient: 0 });
    expect(lightZoneList(store.getState().objects.lightZones).map((z) => z.id)).toEqual([id]);
  });

  it('are those that are an area with a level: at least three corners that are numbers and do not lie on one line', () => {
    const { lightZones } = load({
      lightZones: {
        good: zone('good'),
        line: zone('line', { polygon: SQUARE.slice(0, 2) }),
        broken: zone('broken', { polygon: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 1, y: 1 }] }),
        endless: zone('endless', { polygon: [{ x: 0, y: 0 }, { x: Infinity, y: 0 }, { x: 1, y: 1 }] }),
        flat: zone('flat', { polygon: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }] }),
        dusk: zone('dusk', { ambient: 'dusk' }),
        text: 'a zone',
      },
    });
    expect(Object.keys(lightZones ?? {})).toEqual(['good']);
  });

  it('have a level from 0 to 1 and a colour that is #rrggbb, or none', () => {
    const { lightZones } = load({ lightZones: { bright: zone('bright', { ambient: 7, ambientColor: 'red' }), dark: zone('dark', { ambient: -2, ambientColor: '#204060' }) } });
    expect(lightZones).toEqual({ bright: zone('bright', { ambient: 1 }), dark: zone('dark', { ambient: 0, ambientColor: '#204060' }) });
  });

  it(`are the first ${MAX_LIGHT_ZONES} of a file that holds more`, () => {
    const many = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`z${i}`, zone(`z${i}`)]));
    const { lightZones } = load({ lightZones: many });
    expect(Object.keys(lightZones ?? {})).toEqual(Array.from({ length: MAX_LIGHT_ZONES }, (_, i) => `z${i}`));
    // A record that reaches the rule by another way is read to the same number.
    expect(lightZoneList(many as never)).toHaveLength(MAX_LIGHT_ZONES);
  });

  it('are none when not one of them is a zone', () => {
    expect(load({ lightZones: { line: zone('line', { polygon: [] }) } }).lightZones).toBeUndefined();
  });
});

describe('lights and walls read from a map file', () => {
  it('lose a rotation, a priority and a darkness that are not a number, a number and true', () => {
    const { lights } = load({
      lights: {
        spun: light('spun', { rotation: 'abc', emission: { ...EMISSION, angle: 60 } }),
        odd: light('odd', { rotation: Number.NaN, emission: { ...EMISSION, priority: 'high', darkness: 'false' } }),
        endless: light('endless', { rotation: Infinity, emission: { ...EMISSION, priority: Number.NaN, darkness: 1 } }),
        good: light('good', { rotation: 90, activeBelowAmbient: 0.5, hidden: true, emission: { ...EMISSION, angle: 53, priority: 1, darkness: true, kind: 'darkness' } }),
      },
    });
    expect(lights.spun).toEqual(light('spun', { emission: { ...EMISSION, angle: 60 } }));
    expect(lights.odd).toEqual(light('odd'));
    expect(lights.endless).toEqual(light('endless'));
    expect(lights.good).toEqual(light('good', { rotation: 90, activeBelowAmbient: 0.5, hidden: true, emission: { ...EMISSION, angle: 53, priority: 1, darkness: true, kind: 'darkness' } }));
    // The beam of the light whose rotation was text faces up, as with none.
    expect(beamOf(lights.spun!)?.facing).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('clean the light a token carries the same way', () => {
    const { tokens } = load({ tokens: { t: { id: 't', kind: 'token', imagePath: 't.png', x: 0, y: 0, light: { ...EMISSION, priority: '1', darkness: 'false' } }, u: { id: 'u', kind: 'token', imagePath: 'u.png', x: 0, y: 0, light: { ...EMISSION, darkness: true, priority: 2 } } } });
    expect(tokens.t!.light).toEqual(EMISSION);
    expect(tokens.u!.light).toEqual({ ...EMISSION, darkness: true, priority: 2 });
  });

  it('keep a door locked only where the file says true', () => {
    const { walls } = load({ walls: { text: door('text', { locked: 'false' }), one: door('one', { locked: 1 }), locked: door('locked', { locked: true }), plain: door('plain') } });
    expect(walls.text).toEqual(door('text'));
    expect(walls.one).toEqual(door('one'));
    expect(walls.locked).toEqual(door('locked', { locked: true }));
    expect(walls.plain).toEqual(door('plain'));
    // The door the file locked with a text opens like any other.
    const store = storeWith(load({ walls: { text: door('text', { locked: 'false' }) } }));
    store.getState().toggleDoor('text');
    expect(store.getState().objects.walls.text!.closed).toBe(false);
  });

  it('are none when the file holds something else in their place, and leave entries that are no objects out', () => {
    expect(load({ lights: 'lights', walls: 7 })).toMatchObject({ lights: {}, walls: {} });
    expect(load({ lights: { a: light('a'), b: 'a light', c: null } }).lights).toEqual({ a: light('a') });
  });
});
