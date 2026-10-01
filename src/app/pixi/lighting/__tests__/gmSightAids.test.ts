import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES } from '../../../gameSystems/senses';
import type { TokenEntity } from '../../../types';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';
import type { WallSegment } from '../../../types/wallTypes';
import { computeSight, lightReach, sceneSight, sightSources, type SightSource } from '../../../vision/sight';
import { senseSource, darkvision, tremorsense } from '../../../vision/__tests__/senseSources';
import { tokenPerception } from '../playerLightingLayers';
import { senseRings } from '../senseRings';
import { tokenSightLine } from '../sightInfo';
import { sightMarks } from '../sightMarks';

/** One game unit is one world pixel. */
const scale = { unitDistance: 5, cellSize: 5 };
const bounds = { width: 1000, height: 1000 };
const DND = BUILT_IN_SENSES['builtin:dnd5e']!;
const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 160, y: 0 }, p2: { x: 160, y: 220 } };
const conditions: ConditionDefinition[] = [
  { id: 'unseen', name: 'Invisible', color: '#000000', effect: 'invisible' },
  { id: 'flying', name: 'Flying', color: '#000000', effect: 'airborne' },
];
const mirabel: TokenEntity = {
  id: 'mirabel', kind: 'character', name: 'Mirabel', imagePath: 'm.png', x: 100, y: 100,
  vision: { enabled: true, senses: [{ id: 'dnd5e-darkvision', range: 60 }, { id: 'dnd5e-tremorsense', range: 100 }] },
};
const at = (id: string, x: number, y: number, extra: Partial<Pick<TokenEntity, 'conditions' | 'isHidden' | 'vision'>> = {}): TokenEntity =>
  ({ id, kind: 'token', imagePath: `${id}.png`, x, y, ...extra }) as TokenEntity;
const tokens: Record<string, TokenEntity> = {
  mirabel,
  near: at('near', 140, 100),
  behind: at('behind', 190, 100),
  far: at('far', 100, 250),
  cloaked: at('cloaked', 140, 110, { conditions: ['unseen'] }),
  flying: at('flying', 190, 110, { conditions: ['flying'] }),
  hidden: at('hidden', 140, 120, { isHidden: true }),
  ally: at('ally', 190, 120, { vision: { enabled: true } }),
};
const sight = computeSight(sightSources(tokens, scale, bounds, { definitions: DND, conditions }), [wall]);
const dark = { ambient: 0 };

describe('tokenSightLine', () => {
  const line = (id: string, ambient = dark, lights: ReturnType<typeof lightReach>[] = []): string =>
    tokenSightLine(tokens[id]!, tokens, sight, ambient, lights, { conditions });

  it('names the light a token stands in', () => {
    expect(line('near', { ambient: 1 })).toMatch(/^Bright light · /);
    expect(line('near', { ambient: 0.5 })).toMatch(/^Dim light · /);
    expect(line('near')).toMatch(/^Darkness · /);
    expect(line('near', dark, [lightReach({ x: 140, y: 100 }, 40, [], 20)])).toMatch(/^Bright light · /);
    expect(line('far', dark, [lightReach({ x: 100, y: 220 }, 40, [], 10)])).toMatch(/^Dim light · /);
  });

  it('says which token perceives it, and through which sense', () => {
    expect(line('near')).toBe('Darkness · Seen by Mirabel: Darkvision');
    expect(line('near', { ambient: 1 })).toBe('Bright light · Seen by Mirabel: Sight');
    expect(line('behind')).toBe('Darkness · Sensed by Mirabel: Tremorsense');
    expect(line('cloaked', { ambient: 1 })).toBe('Bright light · Sensed by Mirabel: Tremorsense');
  });

  it('says when the players do not see it', () => {
    expect(line('far')).toBe('Darkness · Not seen by the players');
    expect(line('flying')).toBe('Darkness · Not seen by the players');
    expect(line('hidden', { ambient: 1 })).toBe('Bright light · Hidden from the players');
  });

  it('says that a token with vision is always shown', () => {
    expect(line('ally')).toBe('Darkness · Always shown to the players');
    expect(line('mirabel', { ambient: 1 })).toBe('Bright light · Always shown to the players');
  });

  it('names the sense as the collection writes it', () => {
    const cybereye = BUILT_IN_SENSES['builtin:cyberpunkred']![0]!;
    const viewer = { ...mirabel, vision: { enabled: true, senses: [{ id: cybereye.id }] } };
    const all = { ...tokens, mirabel: viewer };
    const seen = computeSight(sightSources(all, scale, bounds, { definitions: [cybereye], conditions: [] }), []);
    expect(tokenSightLine(tokens.near!, all, seen, dark, [])).toBe(`Darkness · Seen by Mirabel: ${cybereye.name}`);
    expect(cybereye.name).toBe('Low light / IR / UV');
  });

  it('names a viewer without a name "a token", and reads the scene without vision tokens by its light', () => {
    const nameless = { ...tokens, mirabel: { ...at('mirabel', 100, 100), vision: mirabel.vision! } };
    expect(tokenSightLine(tokens.near!, nameless, sight, dark, [], { conditions })).toBe('Darkness · Seen by a token: Darkvision');
    const everything = sceneSight({}, [], [wall]);
    expect(tokenSightLine(tokens.behind!, tokens, everything, { ambient: 1 }, [])).toBe('Bright light · Seen by the players');
    expect(tokenSightLine(tokens.behind!, tokens, everything, dark, [])).toBe('Darkness · Not seen by the players');
  });
});

describe('sightMarks', () => {
  it('marks every token the players do not see, sensed ones apart, and neither party nor hidden tokens', () => {
    const marks = sightMarks(tokens, tokenPerception(sight, dark, [], tokens, { conditions }), 70);
    expect(marks.map((mark) => [mark.tokenId, mark.kind])).toEqual([['behind', 'sensed'], ['far', 'unseen'], ['cloaked', 'sensed'], ['flying', 'unseen']]);
  });

  it('puts the mark on the token\'s edge, up and to the right', () => {
    const [mark] = sightMarks({ far: tokens.far! }, () => 'unseen', 70);
    expect(mark!.x).toBeCloseTo(100 + 31 * Math.SQRT1_2);
    expect(mark!.y).toBeCloseTo(250 - 31 * Math.SQRT1_2);
    const [large] = sightMarks({ far: { ...tokens.far!, size: 1.5 } }, () => 'unseen', 70);
    expect(large!.x).toBeCloseTo(100 + 62 * Math.SQRT1_2);
  });

  it('marks nothing in daylight', () => {
    const lit = computeSight(sightSources({ mirabel }, scale, bounds, { definitions: DND, conditions }), []);
    expect(sightMarks({ mirabel, near: tokens.near!, far: tokens.far! }, tokenPerception(lit, { ambient: 1 }, [], tokens), 70)).toEqual([]);
  });
});

describe('senseRings', () => {
  const UNLIMITED = 1414;
  const feet = (radius: number): string => `${Math.round(radius)}ft`;
  const source = (overrides: Partial<SightSource> = {}): SightSource => ({ tokenId: 't', origin: { x: 500, y: 500 }, range: UNLIMITED, senses: [], ...overrides });

  it('draws a ring for sight with a range and for each sense with a distance, widest first', () => {
    const { rings, unbounded, center } = senseRings(source({ range: 120, senses: [darkvision(60), tremorsense(90), senseSource('blindsight', 30)] }), UNLIMITED, feet);
    expect(center).toEqual({ x: 500, y: 500 });
    expect(rings.map((ring) => [ring.label, ring.radius, ring.style])).toEqual([
      ['Sight 120ft', 120, 'sight'], ['Tremorsense 90ft', 90, 'creatures'], ['Darkvision 60ft', 60, 'sense'], ['Blindsight 30ft', 30, 'sense'],
    ]);
    expect(unbounded).toEqual([]);
  });

  it('names what reaches without limit instead of drawing it', () => {
    const { rings, unbounded } = senseRings(source({ senses: [senseSource('low-light-vision', UNLIMITED), darkvision(60)] }), UNLIMITED, feet);
    expect(rings.map((ring) => ring.label)).toEqual(['Darkvision 60ft']);
    expect(unbounded).toEqual(['Sight', 'Low-light vision']);
  });

  it('caps a sense of the eyes at the sight range, and gives it the cone; the others reach all around', () => {
    const cone = { facing: 0, angle: 1, apex: 31 };
    const { rings, cone: looking } = senseRings(source({ range: 50, cone, senses: [darkvision(60), senseSource('blindsight', 30)] }), UNLIMITED, feet);
    expect(rings.map((ring) => [ring.label, ring.cone])).toEqual([['Sight 50ft', cone], ['Darkvision 50ft', cone], ['Blindsight 30ft', undefined]]);
    expect(looking).toBe(cone);
  });

  it('tells how far the cone\'s edges run: as far as the eyes see, to the map\'s diagonal without a sight range', () => {
    const cone = { facing: 0, angle: 1, apex: 31 };
    expect(senseRings(source({ cone, senses: [darkvision(60)] }), UNLIMITED, feet).coneReach).toBe(UNLIMITED);
    expect(senseRings(source({ cone, range: 50 }), UNLIMITED, feet).coneReach).toBe(50);
    expect(senseRings(source({ range: 50 }), UNLIMITED, feet).coneReach).toBe(0);
    expect(senseRings(source({ cone, blinded: true, senses: [tremorsense(90)] }), UNLIMITED, feet).coneReach).toBe(0);
    expect(senseRings(source({ cone, range: 0, senses: [senseSource('blindsight', 30)] }), UNLIMITED, feet).coneReach).toBe(0);
  });

  it('draws no sight for a blinded token or one without normal sight, and keeps what it senses without the eyes', () => {
    const blinded = senseRings(source({ blinded: true, cone: { facing: 0, angle: 1 }, senses: [tremorsense(90)] }), UNLIMITED, feet);
    expect(blinded.rings.map((ring) => ring.label)).toEqual(['Tremorsense 90ft']);
    expect(blinded).not.toHaveProperty('cone');
    expect(senseRings(source({ range: 0, senses: [darkvision(60), senseSource('blindsight', 30)] }), UNLIMITED, feet).rings.map((ring) => ring.label)).toEqual(['Blindsight 30ft']);
  });
});
