import { describe, expect, it } from 'vitest';
import { lookupRow } from '../../../../src/app/statblocks/expressions/filters';
import { parsePattern } from '../../../../src/app/statblocks/expressions/patternParse';
import { renderPattern } from '../../../../src/app/statblocks/expressions/pattern';
import { isExpressionError } from '../../../../src/app/statblocks/expressions/errors';
import { experienceTable, proficiencyTable } from '../../../../src/app/statblocks/presets/fiveEChallenge';
import { FIVE_E_2014_MONSTER } from '../../../../src/app/statblocks/presets/fiveE2014';
import { FIVE_E_2024_MONSTER } from '../../../../src/app/statblocks/presets/fiveE2024';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { FIVE_E_2024 } from '../../../fixtures/statblockTemplateFixtures';

const RATINGS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, index) => String(index + 1))];

/** The SRDs' table (5.1 and 5.2.1 agree), with CR 0 at 10 as the plan's template gives it. */
const SRD_EXPERIENCE = [
  '10', '25', '50', '100', '200', '450', '700', '1,100', '1,800', '2,300', '2,900', '3,900', '5,000', '5,900', '7,200',
  '8,400', '10,000', '11,500', '13,000', '15,000', '18,000', '20,000', '22,000', '25,000', '33,000', '41,000',
  '50,000', '62,000', '75,000', '90,000', '105,000', '120,000', '135,000', '155,000',
];

function proficiencyOf(rating: string): string {
  const value = rating.includes('/') ? 0 : Number(rating);
  if (value <= 4) return '+2';
  if (value <= 8) return '+3';
  if (value <= 12) return '+4';
  if (value <= 16) return '+5';
  if (value <= 20) return '+6';
  if (value <= 24) return '+7';
  if (value <= 28) return '+8';
  return '+9';
}

function withoutLookupsAndSource(template: StatblockTemplate): Omit<StatblockTemplate, 'lookups' | 'source' | 'sample'> {
  const { lookups: _lookups, source: _source, sample: _sample, ...rest } = template;
  return JSON.parse(JSON.stringify(rest)) as Omit<StatblockTemplate, 'lookups' | 'source' | 'sample'>;
}

/** The template as revision 1 had it: revision 2 added the hidden Spells block and its property, nothing else. */
function revisionOne(template: StatblockTemplate): StatblockTemplate {
  return {
    ...template,
    fields: template.fields.filter((field) => field.key !== 'spells'),
    layout: { ...template.layout, blocks: template.layout.blocks.filter((block) => block.type !== 'spells') },
  };
}

function challengeLine(template: StatblockTemplate, cr: string | number): string {
  const block = template.layout.blocks.find((candidate) => candidate.type === 'stat' && candidate.field === 'cr');
  if (block?.type !== 'stat' || block.pattern === undefined) throw new Error('no challenge stat');
  const ast = parsePattern(block.pattern);
  if (isExpressionError(ast)) throw new Error(ast.message);
  return renderPattern(ast, (ref) => (ref === 'cr' ? cr : undefined), { lookups: template.lookups }).text;
}

describe('the 5E challenge tables', () => {
  // Objects list whole-number keys first, so the rows are compared as tables, not in order.
  it('give experience for each of the 34 ratings from 0 to 30', () => {
    expect(Object.keys(experienceTable())).toHaveLength(34);
    expect(experienceTable()).toEqual(Object.fromEntries(RATINGS.map((rating, index) => [rating, SRD_EXPERIENCE[index]])));
  });

  it('give the proficiency bonus for each of them', () => {
    expect(Object.keys(proficiencyTable())).toHaveLength(34);
    expect(proficiencyTable()).toEqual(Object.fromEntries(RATINGS.map((rating) => [rating, proficiencyOf(rating)])));
  });

  it('find a rating however a note writes it', () => {
    const xp = experienceTable();
    expect(lookupRow(xp, '½')).toBe('100');
    expect(lookupRow(xp, '0.25')).toBe('50');
    expect(lookupRow(xp, '30')).toBe('155,000');
  });
});

describe('the 5E (2024 rules) template', () => {
  it('is §5.8 of the plan: the plan fixture with its block ids, its tables written out and its source', () => {
    expect(withoutLookupsAndSource(revisionOne(FIVE_E_2024_MONSTER.template))).toEqual(withoutLookupsAndSource(FIVE_E_2024));
    expect(FIVE_E_2024_MONSTER.template.lookups).toEqual({ xp: experienceTable(), pb: proficiencyTable() });
  });

  it('writes the challenge with experience and proficiency bonus', () => {
    expect(challengeLine(FIVE_E_2024_MONSTER.template, 10)).toBe('10 (XP 5,900; PB +4)');
    expect(challengeLine(FIVE_E_2024_MONSTER.template, '1/4')).toBe('1/4 (XP 50; PB +2)');
    expect(challengeLine(FIVE_E_2024_MONSTER.template, 'unrated')).toBe('unrated');
  });
});

describe('the 5E templates\' revision 2', () => {
  it.each([
    [FIVE_E_2014_MONSTER, 'e4spell0', 'traits'],
    [FIVE_E_2024_MONSTER, 'b5spell0', 'actions'],
  ] as const)('%s adds a Spellcasting block that hides while empty, after its %s', (builtIn, id, after) => {
    const blocks = builtIn.template.layout.blocks;
    const index = blocks.findIndex((block) => block.id === id);
    expect(builtIn.revision).toBe(2);
    expect(blocks[index]).toEqual({ id, type: 'spells', field: 'spells', heading: 'Spellcasting' });
    expect(blocks[index - 1]).toMatchObject({ type: 'entries', field: after });
    expect(builtIn.template.fields.at(-1)).toEqual({ key: 'spells', label: 'Spells', type: 'spells' });
  });
});

describe('the 5E (2014 rules) template', () => {
  it('has the 2024 keys but initiative and gear', () => {
    const keys2024 = FIVE_E_2024_MONSTER.template.fields.map((field) => field.key);
    const keys2014 = FIVE_E_2014_MONSTER.template.fields.map((field) => field.key);
    expect(keys2014).toEqual(keys2024.filter((key) => key !== 'initiative' && key !== 'gear'));
  });

  it('writes the challenge with experience only', () => {
    expect(challengeLine(FIVE_E_2014_MONSTER.template, 10)).toBe('10 (5,900 XP)');
    expect(FIVE_E_2014_MONSTER.template.lookups).toEqual({ xp: experienceTable() });
  });
});
