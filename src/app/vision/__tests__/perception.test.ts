import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../gameSystems/senses';
import { findSense } from '../../gameSystems/senseRules';
import type { TokenEntity } from '../../types';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import type { LightLevel } from '../../types/senseTypes';
import type { WallSegment } from '../../types/wallTypes';
import type { TokenVision } from '../../types/lightingTypes';
import { perceive, regionContains, seenSpots, type PerceivedTarget, type Perception } from '../perception';
import { computeSight, sceneSight, sightSources } from '../sight';
import type { SightRules } from '../sightRules';

/** One game unit is one world pixel. */
const scale = { unitDistance: 5, cellSize: 5 };
const bounds = { width: 1000, height: 1000 };
/** Right of the viewer, ending above the far point. */
const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 160, y: 0 }, p2: { x: 160, y: 220 } };
const VIEWER = { x: 100, y: 100 };
/** 40 units away with a clear line. */
const NEAR = { x: 140, y: 100 };
/** 90 units away, behind the wall. */
const BEHIND = { x: 190, y: 100 };
/** 150 units away with a clear line: beyond every sense given 100 units. */
const FAR = { x: 100, y: 250 };

const conditions: ConditionDefinition[] = [
  { id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' },
  { id: 'unseen', name: 'Invisible', color: '#000000', effect: 'invisible' },
];
const ALL_SENSES = [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()];
const rules: SightRules = { definitions: ALL_SENSES, conditions };
const dark = { ambient: 0 };

function token(id: string, at: { x: number; y: number }, extra: { vision?: TokenVision; conditions?: string[] } = {}): TokenEntity {
  return { id, kind: 'token', imagePath: `${id}.png`, x: at.x, y: at.y, ...extra };
}

/** A viewer with normal sight and the one sense `id`, 100 units far where the sense takes a distance. */
function viewerWith(id: string | null, blinded = false): TokenEntity {
  const definition = id ? findSense(ALL_SENSES, id)! : null;
  const senses = definition ? [{ id: definition.id, ...(definition.range === 'required' && { range: 100 }) }] : [];
  return token('viewer', VIEWER, { vision: { enabled: true, senses }, ...(blinded && { conditions: ['blind'] }) });
}

const LETTER: Record<Perception, string> = { seen: 'S', sensed: 's', unseen: '-' };
const LEVELS: readonly LightLevel[] = ['bright', 'dim', 'dark', 'magical-dark'];

/** What a viewer with the sense perceives: S seen, s sensed, - not at all. */
function row(id: string | null): string {
  const sightOf = (blinded: boolean): ReturnType<typeof computeSight> =>
    computeSight(sightSources({ viewer: viewerWith(id, blinded) }, scale, bounds, rules), [wall]);
  const [sight, blind] = [sightOf(false), sightOf(true)];
  const at = (point: { x: number; y: number }, level: LightLevel, target: PerceivedTarget = {}, from = sight): string =>
    LETTER[perceive(point, from, level, target)];
  return [
    id ?? 'sight',
    LEVELS.map((level) => at(NEAR, level)).join(''),
    `wall ${at(BEHIND, 'dark')}${at(BEHIND, 'bright')}`,
    `far ${at(FAR, 'dark')}`,
    `invisible ${at(NEAR, 'bright', { invisible: true })}${at(NEAR, 'dark', { invisible: true })}`,
    `blinded ${at(NEAR, 'bright', {}, blind)}${at(NEAR, 'dark', {}, blind)}`,
    `airborne ${at(NEAR, 'bright', { airborne: true })}${at(NEAR, 'dark', { airborne: true })}`,
  ].join(' | ');
}

describe('what a token perceives through each built-in sense', () => {
  it('follows the rule row of the sense', () => {
    // sense | a creature 40 units away in bright, dim, dark, magical dark | behind a wall in the dark, in bright light
    // | 150 units away in the dark | an invisible one in bright light, in the dark | the viewer blinded: bright, dark
    // | a flying one in bright light, in the dark
    expect([null, ...ALL_SENSES.map((sense) => sense.id)].map(row).join('\n')).toMatchInlineSnapshot(`
      "sight | SS-- | wall -- | far - | invisible -- | blinded -- | airborne S-
      darkvision | SSS- | wall -- | far - | invisible -- | blinded -- | airborne SS
      low-light-vision | SS-- | wall -- | far - | invisible -- | blinded -- | airborne S-
      blindsight | SSSS | wall -- | far - | invisible SS | blinded SS | airborne SS
      tremorsense | SSss | wall ss | far - | invisible ss | blinded ss | airborne S-
      truesight | SSSS | wall -- | far - | invisible SS | blinded -- | airborne SS
      see-invisible | SS-- | wall -- | far - | invisible S- | blinded -- | airborne S-
      dnd5e-darkvision | SSS- | wall -- | far - | invisible -- | blinded -- | airborne SS
      dnd5e-blindsight | SSSS | wall -- | far - | invisible SS | blinded SS | airborne SS
      dnd5e-tremorsense | SSss | wall ss | far - | invisible ss | blinded ss | airborne S-
      dnd5e-truesight | SSSS | wall -- | far - | invisible SS | blinded -- | airborne SS
      dnd5e-devils-sight | SSSS | wall -- | far - | invisible -- | blinded -- | airborne SS
      dnd5e-see-invisibility | SS-- | wall -- | far - | invisible S- | blinded -- | airborne S-
      cyberpunkred-low-light-ir-uv | SSS- | wall -- | far S | invisible -- | blinded -- | airborne SS
      ose-infravision | SSS- | wall -- | far - | invisible -- | blinded -- | airborne SS
      pathfinder2e-low-light-vision | SS-- | wall -- | far - | invisible -- | blinded -- | airborne S-
      pathfinder2e-darkvision | SSSS | wall -- | far S | invisible -- | blinded -- | airborne SS
      pathfinder2e-greater-darkvision | SSSS | wall -- | far S | invisible -- | blinded -- | airborne SS
      pathfinder2e-tremorsense | SSss | wall ss | far - | invisible ss | blinded ss | airborne S-
      pathfinder2e-scent | SSss | wall ss | far - | invisible ss | blinded ss | airborne Ss
      pathfinder2e-hearing | SSss | wall ss | far - | invisible ss | blinded ss | airborne Ss
      pathfinder2e-lifesense | SSss | wall ss | far - | invisible ss | blinded ss | airborne Ss
      pathfinder2e-wavesense | SSss | wall ss | far - | invisible ss | blinded ss | airborne Ss
      pathfinder2e-echolocation | SSSS | wall -- | far - | invisible SS | blinded SS | airborne SS
      pathfinder2e-see-the-unseen | SS-- | wall -- | far - | invisible S- | blinded -- | airborne S-
      shadowdark-darkness-adapted | SSS- | wall -- | far S | invisible -- | blinded -- | airborne SS"
    `);
  });
});

describe('rules by name', () => {
  const sightWith = (id: string | null, blinded = false): ReturnType<typeof computeSight> =>
    computeSight(sightSources({ viewer: viewerWith(id, blinded) }, scale, bounds, rules), [wall]);

  it('D&D 5e darkvision: darkness within range is seen, magical darkness is not', () => {
    const sight = sightWith('dnd5e-darkvision');
    expect(perceive(NEAR, sight, 'dark')).toBe('seen');
    expect(perceive(NEAR, sight, 'magical-dark')).toBe('unseen');
    expect(perceive(FAR, sight, 'dark')).toBe('unseen');
  });

  it('D&D 5e blindsight: anything not behind total cover, invisible things too, also while blinded', () => {
    expect(perceive(NEAR, sightWith('dnd5e-blindsight', true), 'dark', { invisible: true })).toBe('seen');
    expect(perceive(BEHIND, sightWith('dnd5e-blindsight'), 'bright')).toBe('unseen');
  });

  it('D&D 5e tremorsense: creatures on the same surface through walls, never those in the air, and it is not sight', () => {
    const sight = sightWith('dnd5e-tremorsense', true);
    expect(perceive(BEHIND, sight, 'dark')).toBe('sensed');
    expect(perceive(BEHIND, sight, 'dark', { airborne: true })).toBe('unseen');
    expect(perceive(NEAR, sight, 'bright')).toBe('sensed');
  });

  it('D&D 5e truesight: normal and magical darkness and invisible creatures, but it needs the eyes', () => {
    expect(perceive(NEAR, sightWith('dnd5e-truesight'), 'magical-dark', { invisible: true })).toBe('seen');
    expect(perceive(NEAR, sightWith('dnd5e-truesight', true), 'bright')).toBe('unseen');
  });

  it('Pathfinder: an imprecise sense makes a creature hidden at best, a precise one observed', () => {
    expect(perceive(BEHIND, sightWith('pathfinder2e-scent'), 'dark')).toBe('sensed');
    expect(perceive(NEAR, sightWith('pathfinder2e-scent', true), 'dark')).toBe('sensed');
    expect(perceive(NEAR, sightWith('pathfinder2e-echolocation', true), 'dark')).toBe('seen');
  });

  it('Pathfinder echolocation shows creatures as they are, so walls stop it; hearing passes them', () => {
    expect(perceive(BEHIND, sightWith('pathfinder2e-echolocation'), 'dark')).toBe('unseen');
    expect(perceive(BEHIND, sightWith('pathfinder2e-hearing'), 'dark')).toBe('sensed');
  });

  it('See Invisibility and See the Unseen: the eyes see invisible creatures where they see, and a blinded token gains nothing', () => {
    for (const id of ['see-invisible', 'dnd5e-see-invisibility', 'pathfinder2e-see-the-unseen']) {
      expect(perceive(NEAR, sightWith(id), 'dim', { invisible: true })).toBe('seen');
      expect(perceive(NEAR, sightWith(id), 'dark', { invisible: true })).toBe('unseen');
      expect(perceive(BEHIND, sightWith(id), 'bright', { invisible: true })).toBe('unseen');
      expect(perceive(NEAR, sightWith(id, true), 'bright', { invisible: true })).toBe('unseen');
    }
  });

  it('seeing invisible things joins the other senses of the eyes: darkvision then sees an invisible creature in the dark', () => {
    const viewer = token('viewer', VIEWER, { vision: { enabled: true, senses: [{ id: 'pathfinder2e-darkvision' }, { id: 'pathfinder2e-see-the-unseen' }] } });
    const sight = computeSight(sightSources({ viewer }, scale, bounds, rules), [wall]);
    expect(perceive(NEAR, sight, 'dark', { invisible: true })).toBe('seen');
    expect(perceive(NEAR, sightWith('pathfinder2e-darkvision'), 'dark', { invisible: true })).toBe('unseen');
  });

  it('an undetected creature is perceived by no sense at all', () => {
    for (const sense of ALL_SENSES) {
      for (const level of LEVELS) expect(perceive(NEAR, sightWith(sense.id), level, { undetected: true })).toBe('unseen');
    }
  });

  it('Old-School Essentials infravision: only in darkness, and light is seen by normal sight', () => {
    expect(perceive(NEAR, sightWith('ose-infravision'), 'dark')).toBe('seen');
    expect(perceive(NEAR, sightWith('ose-infravision', true), 'dark')).toBe('unseen');
    expect(perceive(FAR, sightWith('ose-infravision'), 'bright')).toBe('seen');
    expect(perceive(FAR, sightWith('ose-infravision'), 'dark')).toBe('unseen');
  });

  it('a blinded viewer has no sight at all, in any light', () => {
    for (const level of LEVELS) expect(perceive(NEAR, sightWith(null, true), level)).toBe('unseen');
  });

  it('dim light is seen by normal sight', () => {
    expect(perceive(FAR, sightWith(null), 'dim')).toBe('seen');
  });
});

describe('perceive without vision tokens', () => {
  const everything = sceneSight({}, [], [wall]);

  it('sees whatever is lit, wherever it is', () => {
    expect(everything.all).toBe(true);
    expect(perceive(BEHIND, everything, 'bright')).toBe('seen');
    expect(perceive(BEHIND, everything, 'dim')).toBe('seen');
    expect(perceive(BEHIND, everything, 'dark')).toBe('unseen');
  });

  it('does not see an invisible creature', () => {
    expect(perceive(NEAR, everything, 'bright', { invisible: true })).toBe('unseen');
  });

  it('is what a scene with token vision off gets, whatever its tokens sense', () => {
    const sources = sightSources({ viewer: viewerWith('dnd5e-tremorsense') }, scale, bounds, rules);
    expect(sceneSight({ tokenVision: false }, sources, [wall]).all).toBe(true);
  });
});

describe('regionContains', () => {
  it('reaches a disc for a sense that walls do not stop, a polygon for one they do', () => {
    const [sight, tremor] = computeSight(sightSources({ viewer: viewerWith('tremorsense') }, scale, bounds, rules), [wall]).regions;
    expect(regionContains(tremor!, { x: 200, y: 100 })).toBe(true);
    expect(regionContains(tremor!, { x: 200.5, y: 100 })).toBe(false);
    expect(regionContains(sight!, BEHIND)).toBe(false);
    expect(regionContains(sight!, NEAR)).toBe(true);
  });

  it('cuts the disc of a sense of the eyes to the token\'s cone', () => {
    const smell = { ...findSense(ALL_SENSES, 'pathfinder2e-scent')!, id: 'eyes', worksWhileBlinded: false };
    const viewer = { ...token('viewer', VIEWER, { vision: { enabled: true, angle: 90, senses: [{ id: 'eyes', range: 100 }] } }), rotation: 90 };
    const region = computeSight(sightSources({ viewer }, scale, bounds, { definitions: [smell], conditions }), []).regions[1]!;
    expect(regionContains(region, { x: 150, y: 100 })).toBe(true);
    expect(regionContains(region, { x: 50, y: 100 })).toBe(false);
    expect(regionContains(region, { x: 100, y: 150 })).toBe(false);
    expect(region.cone!.apex).toBeGreaterThan(0);
    expect(regionContains(region, { x: 100, y: 100 + region.cone!.apex! / 2 })).toBe(true);
  });
});

describe('seenSpots', () => {
  const tokensWith = (id: string | null): Record<string, TokenEntity> => ({
    viewer: viewerWith(id),
    near: token('near', NEAR),
    behind: token('behind', BEHIND),
    far: token('far', FAR),
    hidden: token('hidden', NEAR, { conditions: ['unseen'] }),
    ally: token('ally', { x: 120, y: 100 }, { vision: { enabled: false } }),
  });
  const spotsFor = (id: string | null, ambient = 0): { x: number; y: number }[] => {
    const tokens = tokensWith(id);
    const sight = computeSight(sightSources(tokens, scale, bounds, rules), [wall]);
    return seenSpots(sight, { ambient }, [], tokens, conditions, scale.cellSize).map(({ x, y }) => ({ x, y }));
  };

  it('are the tokens echolocation sees in the dark, where nothing shows the map: each is shown in its footprint', () => {
    // Echolocation reaches 100 units here: the two tokens within it, the invisible one too, not the one behind the wall.
    expect(spotsFor('pathfinder2e-echolocation')).toEqual([NEAR, NEAR, { x: 120, y: 100 }]);
  });

  it('are as large as the token', () => {
    const tokens = { viewer: viewerWith('pathfinder2e-echolocation'), big: { ...token('big', NEAR), size: 2 } };
    const sight = computeSight(sightSources(tokens, scale, bounds, rules), [wall]);
    const [small] = seenSpots(sight, dark, [], { ...tokens, big: token('big', NEAR) }, conditions, 70);
    const [large] = seenSpots(sight, dark, [], tokens, conditions, 70);
    expect(small!.radius).toBe(31);
    expect(large!.radius).toBeGreaterThan(small!.radius * 1.9);
  });

  it('are none where the map is shown: in light for sight, in the dark for a sense that shows the map', () => {
    expect(spotsFor('pathfinder2e-echolocation', 1)).toEqual([NEAR]);
    const both = { ...tokensWith(null), viewer: token('viewer', VIEWER, { vision: { enabled: true, senses: [{ id: 'pathfinder2e-echolocation', range: 100 }, { id: 'blindsight', range: 100 }] } }) };
    const sight = computeSight(sightSources(both, scale, bounds, rules), [wall]);
    expect(seenSpots(sight, dark, [], both, conditions, scale.cellSize)).toEqual([]);
  });

  it('are none for senses that only sense, for sight alone, and without vision tokens', () => {
    expect(spotsFor('tremorsense')).toEqual([]);
    expect(spotsFor('darkvision')).toEqual([]);
    expect(spotsFor(null)).toEqual([]);
    expect(seenSpots(sceneSight({}, [], [wall]), dark, [], tokensWith(null), conditions, scale.cellSize)).toEqual([]);
  });
});
