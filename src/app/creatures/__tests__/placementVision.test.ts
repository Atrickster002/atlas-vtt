import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES } from '../../gameSystems/senses';
import type { TokenVisionDefaults } from '../../types/lightingTypes';
import { placementVision } from '../placementVision';
import type { SenseRules } from '../tokenSensesResolver';

const DND = BUILT_IN_SENSES['builtin:dnd5e']!;
const RULES: SenseRules = { definitions: DND, unit: { unitType: 'feet', unitDistance: 5 } };
const darkvision = DND.find((sense) => sense.name === 'Darkvision')!;

const SENSES: TokenVisionDefaults = { range: 120, angle: 90, senses: [{ id: darkvision.id, range: 30 }] };
const OLD_FIELDS: TokenVisionDefaults = { range: 120, darkvision: 30, tremorsense: 10 };

const GOBLIN = { senses: 'darkvision 60 ft., passive Perception 9' };
const COMMONER = { senses: 'passive Perception 10' };

describe('placementVision', () => {
  it('stamps the whole default, vision off, on a token without a statblock', () => {
    expect(placementVision(SENSES, null, RULES)).toEqual({ enabled: false, ...SENSES });
    expect(placementVision(OLD_FIELDS, null, RULES)).toEqual({ enabled: false, ...OLD_FIELDS });
  });

  it('stamps the whole default when the statblock names no sense of the collection', () => {
    expect(placementVision(SENSES, COMMONER, RULES)).toEqual({ enabled: false, ...SENSES });
    expect(placementVision(SENSES, { name: 'Bear' }, RULES)).toEqual({ enabled: false, ...SENSES });
    expect(placementVision(SENSES, { senses: 'scent (imprecise) 30 feet' }, RULES)).toEqual({ enabled: false, ...SENSES });
  });

  it('leaves the default senses out when the statblock has senses, so the token follows it', () => {
    expect(placementVision(SENSES, GOBLIN, RULES)).toEqual({ enabled: false, range: 120, angle: 90 });
    expect(placementVision(OLD_FIELDS, GOBLIN, RULES)).toEqual({ enabled: false, range: 120 });
    expect(placementVision(SENSES, { senses: 'no vision' }, RULES)).toEqual({ enabled: false, range: 120, angle: 90 });
  });

  it('stamps nothing when the default holds only senses the statblock replaces', () => {
    expect(placementVision({ senses: [{ id: darkvision.id }] }, GOBLIN, RULES)).toBeUndefined();
    expect(placementVision({ darkvision: 60 }, GOBLIN, RULES)).toBeUndefined();
  });

  it('never stamps the statblock\'s senses, and never switches vision on', () => {
    for (const fields of [null, GOBLIN, COMMONER]) {
      const vision = placementVision({ range: 120 }, fields, RULES);
      expect(vision).toEqual({ enabled: false, range: 120 });
    }
  });

  it('stamps nothing without a default', () => {
    expect(placementVision(undefined, GOBLIN, RULES)).toBeUndefined();
    expect(placementVision(undefined, null, RULES)).toBeUndefined();
  });

  it('hands every token its own copy', () => {
    const first = placementVision(SENSES, null, RULES)!;
    const second = placementVision(SENSES, null, RULES)!;
    expect(first.senses).toEqual(second.senses);
    expect(first.senses).not.toBe(SENSES.senses);
    expect(first.senses).not.toBe(second.senses);
  });
});
