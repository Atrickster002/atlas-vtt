import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../../../gameSystems/senses';
import type { TokenEntity } from '../../../../types';
import { computeSight, sightSources, type Sight } from '../../../../vision/sight';
import { DARK_SIGHT_LEVELS, ambientLift, darkLooks, pierceShapes, sightChannels } from '../senseDrawing';

const ALL_SENSES = [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()];
const scale = { unitDistance: 5, cellSize: 5 };
const bounds = { width: 1000, height: 1000 };

function sightWith(...ids: string[]): Sight {
  const senses = ids.map((id) => ({ id, ...(ALL_SENSES.find((sense) => sense.id === id)!.range === 'required' && { range: 100 }) }));
  const viewer: TokenEntity = { id: 'v', kind: 'token', imagePath: 'v.png', x: 500, y: 500, vision: { enabled: true, senses } };
  return computeSight(sightSources({ v: viewer }, scale, bounds, { definitions: ALL_SENSES, conditions: [] }), []);
}

describe('sightChannels', () => {
  it('draws sight in red', () => {
    expect(sightChannels(sightWith().regions[0]!)).toEqual([1, 0, 0, 0]);
  });

  it('draws each built-in sense in the channels its rule row asks for', () => {
    // red: seen by light · green: in darkness without colour · blue: in darkness in colour · alpha: dim as bright
    const rows = ALL_SENSES.map((sense) => {
      const region = sightWith(sense.id).regions.find((candidate) => candidate.sense === sense);
      const channels = region && sightChannels(region);
      return `${sense.id} | ${channels ? channels.join('') : 'nothing drawn'}`;
    });
    expect(rows.join('\n')).toMatchInlineSnapshot(`
      "darkvision | 0100
      low-light-vision | 0001
      blindsight | 1011
      tremorsense | nothing drawn
      truesight | 0011
      see-invisible | nothing drawn
      dnd5e-darkvision | 0101
      dnd5e-blindsight | 1011
      dnd5e-tremorsense | nothing drawn
      dnd5e-truesight | 0011
      dnd5e-devils-sight | 0011
      dnd5e-see-invisibility | nothing drawn
      cyberpunkred-low-light-ir-uv | 0011
      ose-infravision | 0100
      pathfinder2e-low-light-vision | 0001
      pathfinder2e-darkvision | 0101
      pathfinder2e-greater-darkvision | 0101
      pathfinder2e-tremorsense | nothing drawn
      pathfinder2e-scent | nothing drawn
      pathfinder2e-hearing | nothing drawn
      pathfinder2e-lifesense | nothing drawn
      pathfinder2e-wavesense | nothing drawn
      pathfinder2e-echolocation | nothing drawn
      pathfinder2e-see-the-unseen | nothing drawn
      shadowdark-darkness-adapted | 0011"
    `);
  });

  it('draws nothing for a sense that walls do not stop, whatever it says it shows', () => {
    const region = sightWith('blindsight').regions[1]!;
    expect(sightChannels(region)).toEqual([1, 0, 1, 1]);
    expect(sightChannels({ ...region, sense: { ...region.sense, lineOfSight: false } })).toBeNull();
    expect(sightChannels({ ...region, sense: { ...region.sense, lineOfSight: false }, polygon: null })).toBeNull();
  });

  it('draws the generic darkvision in green alone, as darkvision was drawn before senses', () => {
    const [sight, darkvision] = sightWith('darkvision').regions;
    expect([sightChannels(sight!), sightChannels(darkvision!)]).toEqual([[1, 0, 0, 0], [0, 1, 0, 0]]);
  });
});

describe('darkLooks', () => {
  const grey = (level: number): number[] => [level, level, level];

  it('is the grey of darkvision without senses, and with the generic or the D&D darkvision', () => {
    const before = { greyKeep: 0.15, greyTint: grey(DARK_SIGHT_LEVELS.dim), greyLevel: DARK_SIGHT_LEVELS.dim, colourLevel: DARK_SIGHT_LEVELS.dim };
    expect(darkLooks({ all: true, regions: [] })).toEqual(before);
    expect(darkLooks(sightWith())).toEqual(before);
    expect(darkLooks(sightWith('darkvision'))).toEqual(before);
    expect(darkLooks(sightWith('dnd5e-darkvision'))).toEqual(before);
    expect(DARK_SIGHT_LEVELS.dim).toBe(0.15);
  });

  it('is black and white at the bright level for Pathfinder darkvision', () => {
    expect(darkLooks(sightWith('pathfinder2e-darkvision'))).toMatchObject({ greyKeep: 0, greyTint: grey(DARK_SIGHT_LEVELS.bright) });
  });

  it('is heat tones at the dim level for infravision: warm, and no colour of the map', () => {
    const { greyKeep, greyTint } = darkLooks(sightWith('ose-infravision'));
    expect(greyKeep).toBe(0);
    expect(greyTint[0]).toBeGreaterThan(greyTint[1]);
    expect(greyTint[1]).toBeGreaterThan(greyTint[2]);
  });

  it('draws what is seen in colour at the bright level for blindsight, truesight and devil\'s sight', () => {
    for (const id of ['blindsight', 'dnd5e-truesight', 'dnd5e-devils-sight', 'shadowdark-darkness-adapted']) {
      expect(darkLooks(sightWith(id)).colourLevel).toBe(DARK_SIGHT_LEVELS.bright);
    }
  });

  it('draws the footprint of a token seen without the map around it at the bright level', () => {
    expect(darkLooks(sightWith('pathfinder2e-echolocation')).colourLevel).toBe(DARK_SIGHT_LEVELS.dim);
    expect(darkLooks(sightWith('pathfinder2e-echolocation'), true).colourLevel).toBe(DARK_SIGHT_LEVELS.bright);
  });

  it('lets the brighter look without colour win where a scene mixes two', () => {
    expect(darkLooks(sightWith('darkvision', 'pathfinder2e-darkvision'))).toMatchObject({ greyKeep: 0, greyTint: grey(DARK_SIGHT_LEVELS.bright) });
    expect(darkLooks(sightWith('pathfinder2e-darkvision', 'ose-infravision'))).toMatchObject({ greyKeep: 0, greyTint: grey(DARK_SIGHT_LEVELS.bright) });
    expect(darkLooks(sightWith('darkvision', 'ose-infravision'))).toMatchObject({ greyKeep: 0.15 });
  });
});

describe('ambientLift', () => {
  it('raises dim ambient light to the bright threshold', () => {
    expect(ambientLift({ ambient: 0.5 })).toBe(1.5);
    expect(ambientLift({ ambient: 0.25 })).toBe(3);
    expect(ambientLift({ ambient: 0.5, brightThreshold: 1 })).toBe(2);
  });

  it('leaves bright light and darkness as they are', () => {
    expect(ambientLift({ ambient: 1 })).toBe(1);
    expect(ambientLift({ ambient: 0.75 })).toBe(1);
    expect(ambientLift({ ambient: 0.15 })).toBe(1);
    expect(ambientLift({ ambient: 0 })).toBe(1);
    expect(ambientLift({ ambient: 0, litThreshold: 0 })).toBe(1);
  });
});

describe('pierceShapes', () => {
  /** How each sense perceives magical darkness: its area at 1 (as bright light) or 0.5 (as dim), or not at all. */
  const levels = (...ids: string[]): number[] => pierceShapes(sightWith(...ids)).map((shape) => shape.level);

  it('is the area of every sense that shows the map and sees in magical darkness, at the level it sees there', () => {
    expect(levels()).toEqual([]);
    expect(levels('darkvision')).toEqual([]);
    expect(levels('dnd5e-darkvision')).toEqual([]);
    expect(levels('dnd5e-devils-sight')).toEqual([1]);
    expect(levels('dnd5e-truesight')).toEqual([1]);
    expect(levels('pathfinder2e-darkvision')).toEqual([0.5]);
    expect(levels('pathfinder2e-greater-darkvision')).toEqual([1]);
    // Tremorsense perceives creatures there, not the map.
    expect(levels('dnd5e-tremorsense')).toEqual([]);
    const sight = sightWith('dnd5e-truesight');
    expect(pierceShapes(sight)[0]!.polygon).toBe(sight.regions.find((region) => region.sense.id === 'dnd5e-truesight')!.polygon);
  });

  it('adds the footprint of every token shown where the map is not, and nothing while line of sight hides nothing', () => {
    const spot = { x: 10, y: 20, radius: 31, polygon: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 40 }] };
    expect(pierceShapes(sightWith(), [spot])).toEqual([{ origin: spot, polygon: spot.polygon, level: 1 }]);
    expect(pierceShapes({ all: true, regions: [] })).toEqual([]);
  });
});
