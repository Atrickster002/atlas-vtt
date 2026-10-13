import { describe, expect, it } from 'vitest';
import { tablesOfNote } from '../../../src/app/randomTables/noteTables';
import { resolveCell, type CellContext, type LinkedTable, type TableResolver } from '../../../src/app/randomTables/resultCells';
import { TABLE_LIMITS } from '../../../src/app/randomTables/tableModel';
import { seededRandom } from '../library/fakeSync';

/** Tables by link: "Gems" is a whole note, "Treasure#Coins" a heading. */
function resolverOf(notes: Record<string, string>): TableResolver {
  return {
    resolve: async (link): Promise<LinkedTable | null> => {
      const [note = '', heading] = link.split('#');
      const text = notes[note];
      if (text === undefined) return null;
      const { tables } = tablesOfNote(text, note);
      const table = heading === undefined ? (tables.length === 1 ? tables[0] : undefined) : tables.find((t) => t.heading === heading);
      return table ? { key: `${note}.md#${table.index}`, table, notePath: `${note}.md` } : null;
    },
  };
}

const context = (notes: Record<string, string> = {}, seed = 1): CellContext => ({
  resolver: resolverOf(notes),
  fromPath: 'Here.md',
  random: seededRandom(seed),
  trail: [],
  budget: { results: TABLE_LIMITS.results },
});

const oneRow = (text: string): string => `| Result |\n| --- |\n| ${text} |\n`;

describe('a rolled cell', () => {
  it('rolls dice in backticks and marks where their totals stand', async () => {
    const cell = await resolveCell('Take `3d6` gold and `dice: 1d4` gems', context());
    expect(cell.text).toMatch(/^Take \d+ gold and \d gems$/);
    expect(cell.rolls).toHaveLength(2);
    const [gold, gems] = cell.rolls;
    expect(gold!.formula).toBe('3d6');
    expect(cell.text.slice(gold!.at, gold!.at + String(gold!.total).length)).toBe(String(gold!.total));
    expect(gems!.formula).toBe('1d4');
    expect(gems!.total).toBeGreaterThanOrEqual(1);
    expect(gems!.total).toBeLessThanOrEqual(4);
  });

  it('leaves plain dice, code and refused formulas as written', async () => {
    const cell = await resolveCell('Deals 1d6 bludgeoning, `code`, `5` and `1000d1000`', context());
    expect(cell.text).toBe('Deals 1d6 bludgeoning, `code`, `5` and `1000d1000`');
    expect(cell.rolls).toEqual([]);
  });

  it('rolls a linked table in place, its own dice included', async () => {
    const cell = await resolveCell('A pouch with [[Gems|some gems]].', context({ Gems: oneRow('`2d4` rubies') }));
    expect(cell.text).toMatch(/^A pouch with \d rubies\.$/);
    expect(cell.rolls[0]!.at).toBe('A pouch with '.length);
  });

  it('rolls a table under a heading, and Dice Roller\'s dice link', async () => {
    const notes = { Treasure: `## Coins\n\n${oneRow('copper')}\n## Gems\n\n${oneRow('jade')}` };
    expect((await resolveCell('[[Treasure#Gems]] and `dice: [[Treasure#Coins]]`', context(notes))).text).toBe('jade and copper');
  });

  it('keeps any other link as a link', async () => {
    const notes = { Two: `## A\n\n${oneRow('a')}\n## B\n\n${oneRow('b')}` };
    expect((await resolveCell('See [[Rules]] and [[Two]]', context(notes))).text).toBe('See [[Rules]] and [[Two]]');
  });

  it('stops at a table that reaches itself', async () => {
    const notes = { Loop: oneRow('again [[Loop]]') };
    const cell = await resolveCell('[[Loop]]', context(notes));
    expect(cell.text).toBe('again [[Loop]]');
    expect(cell.stopped).toEqual(['loop']);
  });

  it('stops nesting at the depth limit', async () => {
    const notes = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`T${i}`, oneRow(`${i} [[T${i + 1}]]`)]));
    const cell = await resolveCell('[[T0]]', context(notes));
    expect(cell.text).toBe(`${Array.from({ length: TABLE_LIMITS.depth }, (_, i) => i).join(' ')} [[T${TABLE_LIMITS.depth}]]`);
    expect(cell.stopped).toEqual(['depth']);
  });

  it('stops at the results limit of one roll', async () => {
    const fan = oneRow('[[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]] [[Leaf]]');
    const notes = { Fan: fan, Mid: oneRow('[[Fan]] [[Fan]] [[Fan]] [[Fan]] [[Fan]] [[Fan]] [[Fan]]'), Leaf: oneRow('x') };
    const cell = await resolveCell('[[Mid]]', context(notes));
    expect(cell.text.split('x').length - 1).toBeLessThan(TABLE_LIMITS.results);
    expect(cell.stopped).toContain('results');
  });
});
