import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { blockEl, renderSheet, templateOf } from './sheetTestKit';

afterEach(cleanup);

const TEMPLATE = templateOf(
  [{ key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX', 'CON'] }],
  [{ id: 'scores01', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)' }] }],
);

/** An empty score table while a statblock is filled in keeps its shape (spec §6.3, judge: novice). */
describe('an empty score table', () => {
  it('shows its labels over blank cells while editing, so the card keeps its shape', () => {
    const { container } = renderSheet(TEMPLATE, {}, { mode: 'editing' });
    const block = blockEl(container, 'scores01')!;
    expect([...block.querySelectorAll('.atlas-sb-score-label')].map((label) => label.textContent)).toEqual(['STR', 'DEX', 'CON']);
    expect([...block.querySelectorAll('.atlas-sb-score')].map((cell) => cell.textContent)).toEqual(['–', '–', '–']);
    expect(block.textContent).not.toContain('Add abilities');
  });

  it('is not drawn at all at runtime', () => {
    const { container } = renderSheet(TEMPLATE, {});
    expect(blockEl(container, 'scores01')).toBeNull();
  });
});

describe('a table slot holding text', () => {
  it('shows the text as written and works out no column over it', () => {
    const { container } = renderSheet(TEMPLATE, { stats: [14, 'd8', '1 per day'] });
    const block = blockEl(container, 'scores01')!;
    expect([...block.querySelectorAll('.atlas-sb-score')].map((cell) => cell.textContent)).toEqual(['14', 'd8', '1 per day']);
    expect([...block.querySelectorAll('.atlas-sb-score-column')].map((cell) => cell.textContent)).toEqual(['2', '', '']);
    expect(block.querySelector('.atlas-sb-problem')).toBeNull();
  });
});
