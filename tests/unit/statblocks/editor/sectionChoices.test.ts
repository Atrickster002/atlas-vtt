import { describe, expect, it } from 'vitest';
import { noteFieldChoices } from '../../../../src/app/statblocks/editor/statblock-pane/fieldChoices';
import { sectionAddition, sectionGroups } from '../../../../src/app/statblocks/editor/statblock-pane/sectionChoices';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { FIVE_E_2014_MONSTER } from '../../../../src/app/statblocks/presets/fiveE2014';
import { foldedBlocks } from '../../../../src/app/statblocks/render/foldRule';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';

const RECORD = {
  statblock: true,
  'atlas-template': MARSH_CREATURE.id,
  name: 'Marsh Warden',
  hp: 52,
  lair: 'A sunken causeway',
  reactions: [{ name: 'Parry', desc: 'It parries.' }],
  tags: ['marsh'],
  'odd key': 'kept out',
};

const labels = (groups: ReturnType<typeof sectionGroups>, id: string): string[] =>
  groups.find((group) => group.id === id)?.choices.map((choice) => choice.label) ?? [];

describe('the note\'s values the template leaves out', () => {
  it('are offered shaped by their values, never Obsidian\'s own properties or keys a template may not name', () => {
    expect(noteFieldChoices(RECORD, MARSH_CREATURE).map(({ key, label, type }) => ({ key, label, type }))).toEqual([
      { key: 'lair', label: 'Lair', type: 'text' },
      { key: 'reactions', label: 'Reactions', type: 'entries' },
    ]);
  });
});

/** "Add a section…" (spec §8.3). */
describe('sectionGroups', () => {
  it('lists the template\'s folded sections first, then the sections it lacks, then the note\'s values', () => {
    const template = FIVE_E_2014_MONSTER.template;
    const groups = sectionGroups(template, { name: 'Aboleth', lair: 'Deep' }, foldedBlocks(template, {}), '');
    expect(groups.map((group) => group.id)).toEqual(['template', 'common', 'note']);
    expect(labels(groups, 'template')).toEqual(['Spellcasting', 'Bonus Actions', 'Reactions', 'Legendary Actions']);
    expect(labels(groups, 'common')).toEqual(['Lair Actions', 'Features', 'Description', 'Tactics', 'Loot']);
    expect(labels(groups, 'note')).toEqual(['Lair']);
  });

  it('finds sections by what is typed, and offers a new one of each kind for a name', () => {
    const groups = sectionGroups(MARSH_CREATURE, {}, [], 'mana');
    expect(labels(groups, 'common')).toEqual([]);
    expect(labels(groups, 'new')).toEqual(['A list of abilities called “mana”', 'A stat called “mana”', 'A paragraph called “mana”', 'Tags called “mana”']);
  });
});

describe('sectionAddition', () => {
  it('adds a headed Spells block bound to a new property, after Traits as books print it', () => {
    const added = sectionAddition(MARSH_CREATURE, { key: 'spells', label: 'Spells', type: 'spells', heading: 'Spellcasting' }, null)!;
    expect(added.template.fields.at(-1)).toEqual({ key: 'spells', label: 'Spells', type: 'spells' });
    const found = findBlock(added.template.layout.blocks, added.blockId)!;
    expect(found.block).toMatchObject({ type: 'spells', field: 'spells', heading: 'Spellcasting' });
    const traits = findBlock(added.template.layout.blocks, 'e5u4x8dc')!;
    expect(found.index).toBe(traits.index + 1);
  });

  it('adds after a block when asked, and reuses a property of that key the template already has', () => {
    const added = sectionAddition(MARSH_CREATURE, { key: 'actions', label: 'Actions', type: 'entries' }, 'p7c4f8ne')!;
    expect(added.template.fields).toHaveLength(MARSH_CREATURE.fields.length);
    expect(findBlock(added.template.layout.blocks, added.blockId)?.index).toBe(findBlock(MARSH_CREATURE.layout.blocks, 'p7c4f8ne')!.index + 1);
  });

  it('gives a new property a key of its own past the template\'s keys', () => {
    const added = sectionAddition(MARSH_CREATURE, { key: null, label: 'Speed', type: 'markdown' }, null)!;
    expect(added.key).toBe('speed_2');
    expect(findBlock(added.template.layout.blocks, added.blockId)?.block).toMatchObject({ type: 'text', heading: 'Speed' });
  });
});
