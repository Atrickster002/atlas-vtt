import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';
import { findBlock } from '../../src/app/statblocks/model/treeQueries';
import { FIVE_E_2024_MONSTER } from '../../src/app/statblocks/presets/fiveE2024';

// Dice links reach the map view, whose services need Node's `events`; nothing here rolls dice.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
  splitDiceSegments: (text: string) => [{ text, dice: false }],
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const THEME = `body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --font-ui-smaller: 12px; --font-ui-small: 13px; }`;
const SLOTS = ['Accuracy', 'Communication', 'Constitution', 'Dexterity', 'Fighting', 'Intelligence', 'Perception', 'Strength', 'Willpower'];
const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'nine-slots-abc123',
  fields: [{ key: 'stats', label: 'Abilities', type: 'scores', slots: SLOTS }],
  layout: { maxColumns: 1, blocks: [{ id: 'scores00', type: 'scores', field: 'stats', orientation: 'row' }] },
};

/**
 * A table with many long column names in a narrow card (a Fantasy Statblocks
 * layout's preview in the gallery), as Obsidian's table widget holds one
 * wider than its note: every name stays in its own cell, and the table
 * scrolls inside its column rather than running past the card.
 */
describe('a table with long column names in a narrow card', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('keeps each name in its cell and scrolls within the card', () => {
    render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width: 240 } },
      React.createElement(StatblockSheet, { template: TEMPLATE, name: 'Nine slots', fields: { stats: SLOTS.map(() => 10) }, variant: 'feed' })));
    const names = [...document.querySelectorAll<HTMLElement>('thead th')];
    expect(names).toHaveLength(SLOTS.length);
    for (const name of names) {
      const cell = name.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(name);
      const text = range.getBoundingClientRect();
      expect(text.left, `${name.textContent} starts in its cell`).toBeGreaterThanOrEqual(cell.left - 0.5);
      expect(text.right, `${name.textContent} ends in its cell`).toBeLessThanOrEqual(cell.right + 0.5);
    }
    const scroller = document.querySelector<HTMLElement>('.atlas-sb-sheet-table__scroll')!;
    const block = scroller.closest('[data-block-id]')!.getBoundingClientRect();
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
    // The scroller reaches past its block only by the room it keeps for the editors' handles.
    expect(scroller.getBoundingClientRect().width).toBeLessThanOrEqual(block.width + 32 + 0.5);
  });
});

/**
 * The 5E (2024 rules) ability table in one column of the statblock pane's
 * two-column card (about 380 px): its three groups stay side by side rather
 * than wrapping two and one, which left Con and Cha alone on a line.
 */
describe('the 5E 2024 ability table in a pane column', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('keeps its three groups on one line', () => {
    const scores = findBlock(FIVE_E_2024_MONSTER.template.layout.blocks, 'b5stats0')?.block;
    expect(scores?.type).toBe('scores');
    const template: StatblockTemplate = { ...FIVE_E_2024_MONSTER.template, layout: { maxColumns: 1, blocks: scores ? [scores] : [] } };
    render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width: 380 + 32 } },
      React.createElement(StatblockSheet, { template, name: '5E (2024 rules)', fields: { stats: [16, 14, 15, 7, 12, 8] }, variant: 'feed' })));
    const groups = [...document.querySelectorAll<HTMLElement>('.atlas-sb-score-group')];
    expect(groups).toHaveLength(3);
    const tops = new Set(groups.map((group) => Math.round(group.getBoundingClientRect().top)));
    expect(tops.size, 'all three groups start on the same line').toBe(1);
  });
});
