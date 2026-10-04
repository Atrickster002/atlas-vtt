import { describe, expect, it } from 'vitest';
import { blockDisplay } from '../../../../src/app/statblocks/render/blockDisplay';
import { foldedBlocks, foldedIds } from '../../../../src/app/statblocks/render/foldRule';
import { sheetState } from '../../../../src/app/statblocks/render/sheetState';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { FIVE_E_2014_MONSTER } from '../../../../src/app/statblocks/presets/fiveE2014';
import { FIVE_E_2024_MONSTER } from '../../../../src/app/statblocks/presets/fiveE2024';
import type { StatblockTemplate, TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';

const FIVE_E = FIVE_E_2014_MONSTER.template;
const headings = (template: StatblockTemplate, record: Record<string, unknown>, unfolded?: Set<string>): string[] =>
  foldedBlocks(template, record, unfolded).map((block) => block.heading);

function withBlocks(template: StatblockTemplate, blocks: TemplateBlock[]): StatblockTemplate {
  return { ...template, layout: { ...template.layout, blocks: [...template.layout.blocks, ...blocks] } };
}

/** Empty headed sections fold into chips under the card (spec §8.2, J6). */
describe('foldedBlocks', () => {
  it('folds the empty headed sections of a new 5E statblock, and keeps its main list of actions', () => {
    expect(headings(FIVE_E, { name: 'Aboleth' })).toEqual(['Spellcasting', 'Bonus Actions', 'Reactions', 'Legendary Actions']);
    expect(headings(FIVE_E_2024_MONSTER.template, { name: 'Aboleth' })).toEqual(['Traits', 'Spellcasting', 'Bonus Actions', 'Reactions', 'Legendary Actions']);
  });

  it('never folds a section with a value, one unfolded on this card, or one with a fallback', () => {
    expect(headings(FIVE_E, { spells: ['Cantrips: light'] })).not.toContain('Spellcasting');
    expect(headings(FIVE_E, {}, new Set(['e4spell0']))).not.toContain('Spellcasting');
    const withFallback = withBlocks(FIVE_E, [{ id: 'lair0000', type: 'entries', field: 'lair', heading: 'Lair', whenEmpty: 'fallback', fallback: 'None' }]);
    expect(headings({ ...withFallback, fields: [...withFallback.fields, { key: 'lair', label: 'Lair', type: 'entries' }] }, {})).not.toContain('Lair');
  });

  it('neither draws nor chips a section whose condition fails, as at runtime', () => {
    const conditional = withBlocks(FIVE_E, [{ id: 'mythic00', type: 'entries', field: 'mythic', heading: 'Mythic', showWhen: { field: 'legendary_actions', is: 'present' } }]);
    expect(headings(conditional, {})).not.toContain('Mythic');
    expect(headings(conditional, { legendary_actions: [{ name: 'Detect', desc: 'It looks.' }] })).toContain('Mythic');
  });

  it('folds a headed Section whose blocks are all empty, once, and never a single stat', () => {
    const section = withBlocks(FIVE_E, [{ id: 'sect0000', type: 'section', heading: 'Lair', blocks: [
      { id: 'stat0000', type: 'stat', field: 'lair_ac', look: 'run-in' },
      { id: 'divi0000', type: 'divider' },
    ] }]);
    expect(foldedBlocks(section, {}).filter((block) => block.blockId === 'sect0000' || block.blockId === 'stat0000')).toEqual([{ blockId: 'sect0000', heading: 'Lair' }]);
    expect(headings(section, { lair_ac: 12 })).not.toContain('Lair');
  });

  it('hides a folded block from the card and its values from editing', () => {
    const folded = foldedIds(foldedBlocks(FIVE_E, {}));
    const sheet = sheetState({ template: FIVE_E, record: {}, mode: 'editing', folded });
    const spells = findBlock(FIVE_E.layout.blocks, 'e4spell0')!.block;
    expect(blockDisplay(spells, sheet)).toBeNull();
    expect(blockDisplay(spells, sheetState({ template: FIVE_E, record: {}, mode: 'editing' }))).not.toBeNull();
  });

  it('leaves a 5E statblock without spells as it was at runtime: the empty Spellcasting block is not drawn', () => {
    const spells = findBlock(FIVE_E.layout.blocks, 'e4spell0')!.block;
    expect(blockDisplay(spells, sheetState({ template: FIVE_E, record: { name: 'Aboleth' }, mode: 'view' }))).toBeNull();
  });
});
