import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../builtInPresets';
import { BUILT_IN_SENSES, GENERIC_SENSES, NORMAL_SIGHT } from '../senses';
import { parseSenseDefinitions } from '../senseValidation';
import { BUILT_IN_ID_PREFIX } from '../../types/systemPresetTypes';
import type { SenseDefinition } from '../../types/senseTypes';

const SYSTEM_SENSES = Object.values(BUILT_IN_SENSES).flat();
const ALL_SENSES = [NORMAL_SIGHT, ...GENERIC_SENSES, ...SYSTEM_SENSES];

/** One sense as a row to hold against the rules tables of the parity research (section 2). */
function row(sense: SenseDefinition): string {
  const flags = [
    sense.seesInvisible && 'sees invisible',
    sense.worksWhileBlinded && 'works while blinded',
    sense.ignores && `ignores ${sense.ignores}`,
    sense.role && `role ${sense.role}`,
  ].filter(Boolean).join(', ') || '-';
  return [
    sense.id,
    sense.lineOfSight ? 'walls block' : 'through walls',
    `${sense.sees.bright} / ${sense.sees.dim} / ${sense.sees.dark} / ${sense.sees.magicalDark}`,
    sense.reveals,
    sense.precise ? 'precise' : 'imprecise',
    sense.look,
    sense.defaultRange === undefined ? sense.range : `${sense.range} (${sense.defaultRange})`,
    flags,
  ].join(' | ');
}

describe('built-in senses', () => {
  it('follow the rules of their system', () => {
    // id | walls | bright / dim / dark / magical dark | reveals | acuity | look in darkness | range (default) | flags
    expect(ALL_SENSES.map(row).join('\n')).toMatchInlineSnapshot(`
      "sight | walls block | normal / normal / none / none | all | precise | colour | optional | -
      darkvision | walls block | normal / normal / as-dim / none | all | precise | monochrome | required | role darkvision
      low-light-vision | walls block | normal / as-bright / none / none | all | precise | colour | unlimited | -
      blindsight | walls block | normal / as-bright / as-bright / as-bright | all | precise | colour | required | sees invisible, works while blinded
      tremorsense | through walls | normal / as-bright / as-bright / as-bright | creatures | imprecise | colour | required | sees invisible, works while blinded, ignores airborne, role tremorsense
      truesight | walls block | normal / as-bright / as-bright / as-bright | all | precise | colour | required | sees invisible
      dnd5e:darkvision | walls block | normal / as-bright / as-dim / none | all | precise | monochrome | required (60) | role darkvision
      dnd5e:blindsight | walls block | normal / as-bright / as-bright / as-bright | all | precise | colour | required (60) | sees invisible, works while blinded
      dnd5e:tremorsense | through walls | normal / as-bright / as-bright / as-bright | creatures | imprecise | colour | required (60) | sees invisible, works while blinded, ignores airborne, role tremorsense
      dnd5e:truesight | walls block | normal / as-bright / as-bright / as-bright | all | precise | colour | required (120) | sees invisible
      dnd5e:devils-sight | walls block | normal / as-bright / as-bright / as-bright | all | precise | colour | required (120) | -
      cyberpunkred:low-light-ir-uv | walls block | normal / as-bright / as-bright / none | all | precise | colour | unlimited | -
      ose:infravision | walls block | none / none / as-dim / none | all | precise | heat | required (60) | role darkvision
      pathfinder2e:low-light-vision | walls block | normal / as-bright / none / none | all | precise | colour | unlimited | -
      pathfinder2e:darkvision | walls block | normal / as-bright / as-bright / none | all | precise | black-and-white | unlimited | role darkvision
      pathfinder2e:greater-darkvision | walls block | normal / as-bright / as-bright / as-bright | all | precise | black-and-white | unlimited | -
      pathfinder2e:tremorsense | through walls | normal / as-bright / as-bright / as-bright | creatures | imprecise | colour | required (30) | sees invisible, works while blinded, ignores airborne, role tremorsense
      pathfinder2e:scent | through walls | normal / as-bright / as-bright / as-bright | creatures | imprecise | colour | required (30) | sees invisible, works while blinded
      pathfinder2e:hearing | through walls | normal / as-bright / as-bright / as-bright | creatures | imprecise | colour | required | sees invisible, works while blinded
      pathfinder2e:lifesense | through walls | normal / as-bright / as-bright / as-bright | creatures | imprecise | colour | required | sees invisible, works while blinded
      pathfinder2e:wavesense | through walls | normal / as-bright / as-bright / as-bright | creatures | imprecise | colour | required | sees invisible, works while blinded
      pathfinder2e:echolocation | through walls | normal / as-bright / as-bright / as-bright | creatures | precise | colour | required (20) | sees invisible, works while blinded
      pathfinder2e:see-the-unseen | walls block | normal / normal / none / none | creatures | precise | colour | unlimited | sees invisible
      shadowdark:darkness-adapted | walls block | normal / as-bright / as-bright / none | all | precise | colour | unlimited | -"
    `);
  });

  it('keep their ids for good: tokens, collections and presets record them', () => {
    expect(GENERIC_SENSES.map((sense) => sense.id)).toEqual(['darkvision', 'low-light-vision', 'blindsight', 'tremorsense', 'truesight']);
    expect(Object.fromEntries(Object.entries(BUILT_IN_SENSES).map(([presetId, senses]) => [presetId, senses.map((sense) => sense.id)]))).toEqual({
      'builtin:dnd5e': ['dnd5e:darkvision', 'dnd5e:blindsight', 'dnd5e:tremorsense', 'dnd5e:truesight', 'dnd5e:devils-sight'],
      'builtin:pathfinder2e': [
        'pathfinder2e:low-light-vision', 'pathfinder2e:darkvision', 'pathfinder2e:greater-darkvision', 'pathfinder2e:tremorsense',
        'pathfinder2e:scent', 'pathfinder2e:hearing', 'pathfinder2e:lifesense', 'pathfinder2e:wavesense', 'pathfinder2e:echolocation',
        'pathfinder2e:see-the-unseen',
      ],
      'builtin:shadowdark': ['shadowdark:darkness-adapted'],
      'builtin:ose': ['ose:infravision'],
      'builtin:cyberpunkred': ['cyberpunkred:low-light-ir-uv'],
    });
    expect(NORMAL_SIGHT.id).toBe('sight');
  });

  it('have unique ids, the systems\' own prefixed with the key of their preset', () => {
    const ids = ALL_SENSES.map((sense) => sense.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sense of GENERIC_SENSES) expect(sense.id).not.toContain(':');
    for (const [presetId, senses] of Object.entries(BUILT_IN_SENSES)) {
      const key = presetId.slice(BUILT_IN_ID_PREFIX.length);
      for (const sense of senses) expect(sense.id.startsWith(`${key}:`)).toBe(true);
    }
  });

  it('are the senses of the built-in presets; systems whose rules have none set none', () => {
    const withSenses = BUILT_IN_SYSTEM_PRESETS.filter((preset) => preset.rules.senses !== undefined);
    expect(withSenses.map((preset) => preset.id).sort()).toEqual(Object.keys(BUILT_IN_SENSES).sort());
    for (const preset of withSenses) expect(preset.rules.senses).toEqual(BUILT_IN_SENSES[preset.id]);
    for (const name of ['Cairn', 'Daggerheart', 'Call of Cthulhu']) {
      expect(BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === name)!.rules).not.toHaveProperty('senses');
    }
  });

  it('are valid as stored: reading them back changes nothing', () => {
    for (const sense of ALL_SENSES) expect(parseSenseDefinitions([sense])).toEqual([sense]);
  });

  it('have a name and say in one line what they let the players see', () => {
    for (const sense of ALL_SENSES) {
      expect(sense.name.trim()).toBe(sense.name);
      expect(sense.name.length).toBeGreaterThan(0);
      expect(sense.description).toMatch(/^[A-Z][^\n]{15,110}\.$/);
    }
  });

  it('have at most one sense per system that old darkvision or tremorsense numbers are read as; the generic set has both', () => {
    for (const senses of [GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES)]) {
      for (const role of ['darkvision', 'tremorsense'] as const) {
        expect(senses.filter((sense) => sense.role === role).length).toBeLessThanOrEqual(1);
      }
    }
    expect(GENERIC_SENSES.find((sense) => sense.role === 'darkvision')?.id).toBe('darkvision');
    expect(GENERIC_SENSES.find((sense) => sense.role === 'tremorsense')?.id).toBe('tremorsense');
  });

  it('never perceive dim light worse than darkness', () => {
    for (const sense of ALL_SENSES) {
      if (sense.sees.dark === 'as-bright') expect(sense.sees.dim).toBe('as-bright');
      if (sense.sees.magicalDark !== 'none') expect(sense.sees.dark).not.toBe('none');
    }
  });

  it('that go through walls do not use the eyes, and only sense creatures', () => {
    for (const sense of ALL_SENSES.filter((candidate) => !candidate.lineOfSight)) {
      expect(sense.worksWhileBlinded).toBe(true);
      expect(sense.reveals).toBe('creatures');
    }
  });

  it('take a default distance only when a token gives them one', () => {
    for (const sense of ALL_SENSES) {
      if (sense.defaultRange !== undefined) {
        expect(sense.range).toBe('required');
        expect(sense.defaultRange).toBeGreaterThan(0);
      }
    }
  });
});
