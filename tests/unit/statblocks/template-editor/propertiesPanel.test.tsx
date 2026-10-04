import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  hasOwnSample, sampleToText, textToSample, withSample,
} from '../../../../src/app/statblocks/editor/template-editor/sampleText';
import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, template } from './editorKit';
import { key, mountEditor, openDock, typeAndLeave } from './sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const field = (type: TemplateField['type'], extra: Partial<TemplateField> = {}): TemplateField => ({ key: 'f', label: 'Field', type, ...extra });

describe('sample values as text', () => {
  it('reads and writes each type as one line', () => {
    expect(textToSample(field('number'), ' 14 ')).toBe(14);
    expect(textToSample(field('number'), 'lots')).toBe('lots');
    expect(textToSample(field('number'), '')).toBeNull();
    expect(textToSample(field('rating'), '1/4')).toBe('1/4');
    expect(textToSample(field('rating'), '3')).toBe(3);
    expect(textToSample(field('list'), 'Common, Elvish ,')).toEqual(['Common', 'Elvish']);
    expect(textToSample(field('scores', { slots: ['A', 'B', 'C'] }), '10 12, 14')).toEqual([10, 12, 14]);
    expect(textToSample(field('pairs'), 'dex 5, con: +3, wis')).toEqual({ dex: 5, con: 3, wis: 0 });
    expect(sampleToText(field('pairs'), { dex: 5, con: 3 })).toBe('dex 5, con 3');
    expect(sampleToText(field('list'), ['a', 'b'])).toBe('a, b');
    expect(sampleToText(field('number'), null)).toBe('');
  });

  it('names entries as typed and keeps what each held at its place', () => {
    const entries = field('entries');
    const before = [{ name: 'Bite', desc: 'Ouch.' }];
    expect(textToSample(entries, 'Claws, Tail', before)).toEqual([{ name: 'Claws', desc: 'Ouch.' }, { name: 'Tail', desc: 'What the feature does, in a sentence.' }]);
    expect(sampleToText(entries, before)).toBe('Bite');
  });

  it('stores only samples that differ from the default, and leaves the template alone when nothing changes', () => {
    const number = { key: 'ac', label: 'Armor class', type: 'number' as const };
    const base = template([], [number]);
    const set = withSample(base, number, 14);
    expect(set.sample).toEqual({ ac: 14 });
    expect(hasOwnSample(set, 'ac')).toBe(true);
    expect(withSample(set, number, 14)).toBe(set);
    expect(withSample(base, number, 13)).toBe(base);
    expect('sample' in withSample(set, number, undefined)).toBe(false);
    expect('sample' in withSample(set, number, 13)).toBe(false);
  });
});

function openFields(): HTMLElement {
  openDock('Properties');
  return document.querySelector<HTMLElement>('.atlas-te-fields')!;
}

const rowOf = (list: HTMLElement, label: string): HTMLElement => {
  const found = [...list.querySelectorAll<HTMLElement>('.atlas-te-fields__row')].find((row) => row.querySelector('.atlas-te-fields__label')?.textContent === label);
  if (!found) throw new Error(`no field ${label}`);
  return found;
};

const tab = (name: string): void => { fireEvent.click(screen.getByRole('radio', { name })); };

describe('the Properties panel (spec §10.7)', () => {
  it('lists the properties on the card with their kind and what Atlas reads them as, never their names in notes', () => {
    const base = sampleTemplate();
    const fields = [...base.fields.map((entry) => (entry.key === 'hp' ? { ...entry, meaning: 'hit-points' as const } : entry)), { key: 'notes', label: 'Notes', type: 'markdown' as const }];
    mountEditor(new FakeSession({ ...base, fields }));
    const list = openFields();
    const hp = rowOf(list, 'Hit points');
    expect(hp.querySelector('.atlas-te-fields__type')?.textContent).toBe('Number');
    expect(hp.querySelector('.atlas-te-fields__badge')?.textContent).toBe('Hit points');
    expect(list.textContent).not.toMatch(/\bhp\b/);
    expect(screen.getByRole('list', { name: 'On the card' })).toBeTruthy();
    tab('Not on the card');
    const apart = screen.getByRole('list', { name: 'Not on the card' });
    expect(within(apart).getByText('Notes')).toBeTruthy();
    expect(within(apart).queryByText('Hit points')).toBeNull();
  });

  it('makes a property no block shows, for a condition to decide by, and deletes it again', () => {
    const session = new FakeSession(sampleTemplate());
    mountEditor(session);
    openFields();
    tab('Not on the card');
    fireEvent.click(screen.getByRole('button', { name: 'New property' }));
    const form = screen.getByRole('form', { name: 'New property' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Legendary' } });
    fireEvent.change(within(form).getByLabelText('Holds'), { target: { value: 'choice' } });
    fireEvent.change(within(form).getByLabelText('Choices'), { target: { value: 'Yes, No' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }));
    expect(session.template.fields.at(-1)).toEqual({ key: 'legendary', label: 'Legendary', type: 'choice', options: ['Yes', 'No'] });
    expect(session.template.layout.blocks.some((block) => 'field' in block && block.field === 'legendary')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Legendary: statblocks keep their values' }));
    expect(session.template.fields.some((field) => field.key === 'legendary')).toBe(false);
  });

  it('makes a lookup table, fills it by pasting from a spreadsheet, and renames it', () => {
    const session = new FakeSession(sampleTemplate());
    mountEditor(session);
    openFields();
    tab('Tables');
    expect(screen.getByText('Tables turn one value into another, like a rating into XP.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New table' }));
    expect(session.template.lookups).toEqual({ table: {} });
    const grid = screen.getByRole('table', { name: 'table rows' });
    fireEvent.paste(grid, { clipboardData: { getData: () => '1/4\t50\n1/2\t100' } });
    expect(session.template.lookups).toEqual({ table: { '1/4': '50', '1/2': '100' } });
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Table name' });
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: 'XP' } });
    fireEvent.blur(name);
    expect(Object.keys(session.template.lookups ?? {})).toEqual(['xp']);
  });

  it('stores a typed sample in the template as one step, and resets it to the default', () => {
    const session = new FakeSession(sampleTemplate());
    mountEditor(session);
    const list = openFields();
    const input = within(rowOf(list, 'Armor class')).getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('13');
    typeAndLeave(input, '1', '14');
    expect(session.template.sample).toEqual({ ac: 14 });
    expect(session.steps).toBe(1);
    expect(document.querySelector('.atlas-te-stage [data-block-id="stat-ac1"]')?.textContent).toContain('14');
    fireEvent.click(within(rowOf(list, 'Armor class')).getByText('Use the default sample').closest('button')!);
    expect(session.template.sample).toBeUndefined();
    expect(session.steps).toBe(2);
  });

  it('puts back a typed sample with Escape and leaves no step', () => {
    const session = new FakeSession(sampleTemplate());
    mountEditor(session);
    const input = within(rowOf(openFields(), 'Speed')).getByRole<HTMLInputElement>('textbox');
    fireEvent.change(input, { target: { value: '40 ft.' } });
    key(input, 'Escape');
    expect(session.template.sample).toBeUndefined();
    expect(input.value).toBe('30 ft.');
    expect(session.steps).toBe(0);
  });

  it('selects the first block that shows a field', () => {
    const { frame } = mountEditor();
    const list = openFields();
    fireEvent.click(rowOf(list, 'Hit points').querySelector('.atlas-te-fields__head')!);
    expect(frame('stat-hp1').getAttribute('data-te-selected')).toBe('primary');
  });

  it('says where properties come from while there is none', () => {
    mountEditor(new FakeSession(template([])));
    openFields();
    expect(screen.getByText('Properties appear here as you name blocks.')).toBeTruthy();
  });
});
