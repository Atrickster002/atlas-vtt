import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import {
  collectionInitiativeRules, parseInitiativeRules, sameInitiativeRules, savedInitiativeRules,
} from '../../src/app/gameSystems/initiativeRules';
import { isSameAsTyped } from '../../src/app/gameSystems/rulesView';
import { parseUserPreset } from '../../src/app/gameSystems/presetValidation';
import { sameSystemRules } from '../../src/app/gameSystems/systemRules';
import { BUILT_IN_TEMPLATES } from '../../src/app/statblocks/presets';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const D20: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
const preset = (name: string): (typeof BUILT_IN_SYSTEM_PRESETS)[number] => BUILT_IN_SYSTEM_PRESETS.find((p) => p.name === name)!;

describe('the statblock field of the initiative modifier', () => {
  it('is read trimmed, and a blank or no text is no field', () => {
    expect(parseInitiativeRules({ ...D20, modifierField: ' combat.init ' })).toEqual({ ...D20, modifierField: 'combat.init' });
    expect(parseInitiativeRules({ ...D20, modifierField: '  ' })).toEqual(D20);
    expect(parseInitiativeRules({ ...D20, modifierField: 4 })).toEqual(D20);
  });

  it('round-trips through saving: stored trimmed, a blank field not stored at all', () => {
    const saved = savedInitiativeRules({ ...D20, modifierField: ' dex_mod ' });
    expect(saved).toEqual({ ...D20, modifierField: 'dex_mod' });
    expect(parseInitiativeRules(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(savedInitiativeRules({ ...D20, modifierField: '' })).not.toHaveProperty('modifierField');
  });

  it('makes rules differ, and reads unset as no field', () => {
    expect(sameInitiativeRules(D20, { ...D20, modifierField: 'initiative' })).toBe(false);
    expect(sameInitiativeRules({ ...D20, modifierField: 'init ' }, { ...D20, modifierField: 'init' })).toBe(true);
    expect(sameInitiativeRules(D20, { ...D20, modifierField: '' })).toBe(true);
    expect(isSameAsTyped({ ...D20, modifierField: 'init' }, D20)).toBe(false);
    expect(isSameAsTyped({ ...D20, modifierField: 'init' }, { ...D20, modifierField: 'init' })).toBe(true);
  });

  it('is kept by a user preset', () => {
    const parsed = parseUserPreset({
      id: 'p', name: 'Home', builtIn: false,
      rules: { ...preset('D&D 5e').rules, initiative: { ...D20, modifierField: 'init' } },
    });
    expect(parsed?.rules.initiative).toEqual({ ...D20, modifierField: 'init' });
  });

  it('names the initiative field where the built-in system\'s statblock template has one', () => {
    for (const name of ['D&D 5e', 'Pathfinder 2e']) {
      const system = preset(name);
      const field = collectionInitiativeRules({ systemPresetId: system.id }, BUILT_IN_SYSTEM_PRESETS).modifierField;
      expect(field, name).toBe('initiative');
      for (const role of system.rules.statblockRoles ?? []) {
        const template = BUILT_IN_TEMPLATES.find((t) => t.id === role.templateId)!;
        expect(template.template.fields.find((f) => f.key === field)?.meaning, `${name} ${role.templateId}`).toBe('initiative');
      }
    }
  });

  it('counts a collection that follows its preset\'s field as unedited', () => {
    const system = preset('D&D 5e');
    expect(sameSystemRules(system.rules, { ...system.rules })).toBe(true);
    expect(sameSystemRules(system.rules, { ...system.rules, initiative: { ...D20, modifierField: 'init' } })).toBe(false);
  });
});
