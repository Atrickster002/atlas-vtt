import { describe, expect, it } from 'vitest';
import {
  addTable, deleteTable, renameTable, rowsFromPaste, setTableRows, tableNameOf, tableNameProblem, tableRows,
} from '../../../../src/app/statblocks/model/lookupOps';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';

/** Lookup tables in the editor (spec §10.6). */
describe('lookup tables', () => {
  it('adds a table under a free name, renames and deletes it, leaving no empty lookups behind', () => {
    const first = addTable(MARSH_CREATURE, 'XP');
    expect(first.name).toBe('xp_2');
    const second = addTable(first.template);
    expect(second.name).toBe('table');
    const renamed = renameTable(second.template, 'table', 'rank_dice');
    expect(Object.keys(renamed.lookups ?? {})).toEqual(['xp', 'xp_2', 'rank_dice']);
    expect(renameTable(renamed, 'rank_dice', 'xp')).toBe(renamed);
    const bare = { ...MARSH_CREATURE, lookups: { only: {} } };
    expect('lookups' in deleteTable(bare, 'only')).toBe(false);
  });

  it('sets a table\'s rows in order, dropping rows without a value to look up, and changes nothing for the same rows', () => {
    const { template, name } = addTable(MARSH_CREATURE, 'Rank');
    const filled = setTableRows(template, name, [['1', 'd6'], ['', 'lost'], ['2', 'd8']]);
    expect(tableRows(filled, name)).toEqual([['1', 'd6'], ['2', 'd8']]);
    expect(setTableRows(filled, name, [['1', 'd6'], ['2', 'd8']])).toBe(filled);
  });

  it('reads rows pasted from a spreadsheet or typed with commas', () => {
    expect(rowsFromPaste('1/4\t50\n1/2\t100\n\n1\t200')).toEqual([['1/4', '50'], ['1/2', '100'], ['1', '200']]);
    expect(rowsFromPaste('1, d6\n2; d8, then d10\n3')).toEqual([['1', 'd6'], ['2', 'd8, then d10'], ['3', '']]);
  });

  it('names tables as patterns can write them', () => {
    expect(tableNameOf(' XP by rating ')).toBe('xp_by_rating');
    expect(tableNameProblem(MARSH_CREATURE, 'xp')).toBe('Another table has that name.');
    expect(tableNameProblem(MARSH_CREATURE, '9lives')).not.toBeNull();
    expect(tableNameProblem(MARSH_CREATURE, 'xp', 'xp')).toBeNull();
  });
});
