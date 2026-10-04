import { describe, expect, it } from 'vitest';
import { GENERIC_CREATURE } from '../../../../src/app/statblocks/presets/generic';
import { EVERY_BLOCK } from '../../../fixtures/statblockTemplateFixtures';
import { sheetState } from '../../../../src/app/statblocks/render/sheetState';
import { editableSpots, neighbourSpot, patternFields } from '../../../../src/app/statblocks/editor/statblock-pane/editableSpots';

const creature = GENERIC_CREATURE.template;
const spotsOf = (record: Record<string, unknown>, template = creature): ReturnType<typeof editableSpots> =>
  editableSpots(template, sheetState({ template, record, mode: 'editing' }));

describe('editableSpots', () => {
  it('walks every field in the template\'s field order, empty ones included; the art is the token socket\'s', () => {
    const { order, byBlock } = spotsOf({ name: 'Marsh Warden' });
    expect(order.map((spot) => spot.field.key)).toEqual(creature.fields.map((field) => field.key).filter((key) => key !== 'image'));
    expect([...byBlock.values()].flat().some((field) => field.key === 'image')).toBe(false);
  });

  it('edits each field in the block that shows it, a line\'s fields together', () => {
    const { byBlock } = spotsOf({});
    expect(byBlock.get('gcline00')?.map((field) => field.key)).toEqual(['size', 'type']);
    expect(byBlock.get('gchp0000')?.map((field) => field.key)).toEqual(['hp']);
    expect(byBlock.get('gcaction')?.map((field) => field.key)).toEqual(['actions']);
    // Containers hold no values of their own.
    expect(byBlock.has('gchead00')).toBe(false);
  });

  it('offers nothing in a block the card hides', () => {
    const spirit = spotsOf({ kind: 'Spirit' }, EVERY_BLOCK);
    expect(spirit.byBlock.has('b3entr00')).toBe(false);
    expect(spirit.order.some((spot) => spot.field.key === 'moves')).toBe(false);
    expect(spotsOf({ kind: 'Beast' }, EVERY_BLOCK).byBlock.has('b3entr00')).toBe(true);
  });

  it('reads plain references from a pattern, never a slot or a formula', () => {
    expect(patternFields('{hp}[ ({hit_dice})]')).toEqual(['hp', 'hit_dice']);
    expect(patternFields('{stats.1} {=floor((stats.1 - 10) / 2)}')).toEqual([]);
    expect(patternFields('{unclosed')).toEqual([]);
  });

  it('steps forwards and back, and nowhere past either end', () => {
    const { order } = spotsOf({});
    expect(neighbourSpot(order, 'name', 1)?.field.key).toBe('size');
    expect(neighbourSpot(order, 'size', -1)?.field.key).toBe('name');
    expect(neighbourSpot(order, 'name', -1)).toBeNull();
    expect(neighbourSpot(order, 'actions', 1)).toBeNull();
  });
});
