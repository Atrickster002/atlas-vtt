import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, template } from './editorKit';
import { key, mountEditor, settingsPanel, typeAndLeave } from './sidePanesKit';

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

/** The inspector's content for the selection now; the one it shows before fades out beside it. */
const inspector = (): HTMLElement => settingsPanel();
const header = (title: string): HTMLElement => {
  const found = [...inspector().querySelectorAll<HTMLElement>('.atlas-te-group__header')].find((element) => element.querySelector('span')?.textContent === title);
  if (!found) throw new Error(`no group ${title}`);
  return found;
};
const group = (title: string): HTMLElement => {
  if (title === 'Basics') return within(inspector()).getByRole('region', { name: 'Basics' });
  return header(title).closest<HTMLElement>('.atlas-te-group')!;
};
const open = (title: string): HTMLElement => {
  if (title !== 'Basics' && header(title).getAttribute('aria-expanded') !== 'true') fireEvent.click(header(title));
  return group(title);
};
const blockOf = (session: FakeSession, id: string): TemplateBlock | undefined => findBlock(session.template.layout.blocks, id)?.block;
const fieldOf = (session: FakeSession, key: string): unknown => session.template.fields.find((field) => field.key === key);

/** Picks an option of the Atlas Select named `name` inside `container`. */
function choose(container: HTMLElement, name: string, option: string): void {
  fireEvent.click(within(container).getByRole('combobox', { name }));
  fireEvent.click(within(container).getByRole('option', { name: option }));
}

describe('the Settings panel in layers (spec §10)', () => {
  it('names the selected block, shows its Basics, and folds More options with what each holds', () => {
    const { frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    expect(inspector().querySelector('.atlas-te-insp__name')?.textContent).toBe('Armor class');
    expect(inspector().querySelector('.atlas-te-insp__type')?.textContent).toBe('Value');
    expect(within(group('Basics')).getByRole('textbox', { name: 'Label' })).toBeTruthy();
    expect(header('Visibility').getAttribute('aria-expanded')).toBe('false');
    expect(header('Visibility').textContent).toContain('Hides when empty');
    expect(header('Property').textContent).toContain('Number');
    for (const banned of ['Field', 'Pattern', 'Meaning', 'Key', 'Look', 'Format', 'Content']) {
      expect([...inspector().querySelectorAll('.atlas-te-setting__label, .atlas-te-group__header span:first-child')].map((label) => label.textContent)).not.toContain(banned);
    }
  });

  it('edits the Basics: a typed label is one step, the style another', () => {
    const { session, frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    const basics = group('Basics');
    typeAndLeave(within(basics).getByRole('textbox', { name: 'Label' }), 'A', 'AC');
    expect(fieldOf(session, 'ac')).toMatchObject({ label: 'AC' });
    fireEvent.click(within(group('Basics')).getByRole('radio', { name: 'Label above' }));
    expect(blockOf(session, 'stat-ac1')).toMatchObject({ look: 'stacked' });
    fireEvent.click(within(group('Basics')).getByRole('switch', { name: 'Show label' }));
    expect(blockOf(session, 'stat-ac1')).toMatchObject({ label: '' });
    fireEvent.click(within(group('Basics')).getByRole('radio', { name: '+3' }));
    expect(blockOf(session, 'stat-ac1')).toMatchObject({ display: 'signed' });
    expect(session.steps).toBe(4);
    fireEvent.click(frame('stat-sp1'));
    fireEvent.click(within(group('Basics')).getByRole('radio', { name: 'Fill' }));
    expect(blockOf(session, 'stat-sp1')).toMatchObject({ size: 'fill' });
  });

  it('edits the Property, naming its reach first: the kind of value, its choices', () => {
    const { session, frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    const property = open('Property');
    expect(property.textContent).toMatch(/No statblock uses Armor class yet|Changes Armor class in/);
    choose(property, 'Kind of value', 'One of a list');
    expect(fieldOf(session, 'ac')).toMatchObject({ type: 'choice' });
    typeAndLeave(within(group('Property')).getByRole('textbox', { name: 'Choices' }), 'Light, Heavy');
    fireEvent.click(within(group('Property')).getByRole('switch', { name: 'Allow other values' }));
    expect(fieldOf(session, 'ac')).toMatchObject({ options: ['Light', 'Heavy'], open: true });
    typeAndLeave(within(group('Property')).getByRole('textbox', { name: 'Prompt when empty' }), 'Add armour');
    expect(fieldOf(session, 'ac')).toMatchObject({ prompt: 'Add armour' });
    choose(group('Property'), 'Atlas reads it as', 'Armor');
    expect(fieldOf(session, 'ac')).toMatchObject({ meaning: 'armor' });
  });

  it('edits Visibility: a text shown when empty, typed as text, and only when another property says so', () => {
    const { session, frame } = mountEditor();
    fireEvent.click(frame('stat-hp1'));
    const visibility = open('Visibility');
    fireEvent.click(within(visibility).getByRole('radio', { name: 'Show text' }));
    expect(blockOf(session, 'stat-hp1')).toMatchObject({ whenEmpty: 'fallback' });
    fireEvent.click(within(group('Visibility')).getByText('Edit as text').closest('button')!);
    typeAndLeave(within(group('Visibility')).getByRole('textbox', { name: 'Text shown' }), '{', '{ac', '{ac}');
    expect(blockOf(session, 'stat-hp1')).toMatchObject({ fallback: '{ac}' });
    expect(within(group('Visibility')).getByText('Shows “13”')).toBeTruthy();
    fireEvent.click(within(group('Visibility')).getByRole('radio', { name: 'Only when…' }));
    const property = within(group('Visibility')).getByRole('combobox', { name: 'Property' });
    fireEvent.change(property, { target: { value: 'armor' } });
    key(property, 'Enter');
    choose(group('Visibility'), 'When it', 'is above');
    typeAndLeave(within(group('Visibility')).getByRole('textbox', { name: 'Value' }), '1', '12');
    expect(blockOf(session, 'stat-hp1')).toMatchObject({ showWhen: { field: 'ac', is: 'above', value: 12 } });
    fireEvent.click(within(group('Visibility')).getByRole('radio', { name: 'Always' }));
    expect(blockOf(session, 'stat-hp1')).not.toHaveProperty('showWhen');
  });

  it('says what is wrong with a Write as in plain words, and looks a value up in a new table', () => {
    const { session, frame } = mountEditor();
    fireEvent.click(frame('stat-hp1'));
    const write = open('Write as');
    fireEvent.click(within(write).getByText('Edit as text').closest('button')!);
    fireEvent.change(within(group('Write as')).getByRole('textbox', { name: 'Write as' }), { target: { value: '{hp' } });
    expect(within(group('Write as')).getByText('A “{” is never closed.')).toBeTruthy();
    choose(group('Write as'), 'Look up in a table', 'New table…');
    expect(session.template.lookups).toEqual({ table: {} });
    expect(blockOf(session, 'stat-hp1')).toMatchObject({ pattern: expect.stringContaining('{hp|lookup:table}') });
  });

  it('edits the dice a stat rolls and its unit', () => {
    const base = sampleTemplate();
    const session = new FakeSession({ ...base, fields: [...base.fields, { key: 'hit_dice', label: 'Hit dice', type: 'dice' }] });
    const { frame } = mountEditor(session);
    fireEvent.click(frame('stat-hp1'));
    typeAndLeave(within(group('Basics')).getByRole('textbox', { name: 'Unit' }), 'hp');
    const rolls = within(open('Write as')).getByRole('combobox', { name: 'Rolls' });
    fireEvent.change(rolls, { target: { value: 'hit' } });
    key(rolls, 'Enter');
    expect(blockOf(session, 'stat-hp1')).toMatchObject({ rollFrom: 'hit_dice' });
    expect(fieldOf(session, 'hp')).toMatchObject({ unit: 'hp' });
    expect(header('Write as').getAttribute('aria-expanded')).toBe('true');
  });

  it('sets a theme class For themes', () => {
    const { session, frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    typeAndLeave(within(open('For themes')).getByRole('textbox', { name: 'Theme class' }), 'armor');
    expect(blockOf(session, 'stat-ac1')).toMatchObject({ className: 'armor' });
  });

  it('edits a section\'s heading, a side by side block\'s alignment and a heading\'s size', () => {
    const base = sampleTemplate();
    const session = new FakeSession({ ...base, layout: { ...base.layout, blocks: [...base.layout.blocks, { id: 'heading1', type: 'heading', text: 'Actions', level: 'section' }] } });
    const { frame } = mountEditor(session);
    fireEvent.click(frame('section1'));
    typeAndLeave(within(group('Basics')).getByRole('textbox', { name: 'Text' }), 'Guard');
    fireEvent.click(frame('row00001'));
    fireEvent.click(within(group('Basics')).getByRole('radio', { name: 'Spread' }));
    fireEvent.click(frame('heading1'));
    fireEvent.click(within(group('Basics')).getByRole('radio', { name: 'Minor' }));
    expect(blockOf(session, 'section1')).toMatchObject({ heading: 'Guard' });
    expect(blockOf(session, 'row00001')).toMatchObject({ align: 'spread' });
    expect(blockOf(session, 'heading1')).toMatchObject({ level: 'minor' });
    expect(session.steps).toBe(3);
  });

  it('adds a worked-out column and turns it into one read from a property', () => {
    const session = new FakeSession(template(
      [{ id: 'scores01', type: 'scores', field: 'stats', orientation: 'row' }],
      [{ key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX'] }, { key: 'saves', label: 'Saves', type: 'pairs' }],
    ));
    const { frame } = mountEditor(session);
    fireEvent.click(frame('scores01'));
    fireEvent.click(within(group('Basics')).getByText('Add column').closest('button')!);
    expect(blockOf(session, 'scores01')).toMatchObject({ columns: [{ formula: 'value' }] });
    choose(group('Basics'), 'Reads', 'A property');
    const field = within(group('Basics')).getByRole('combobox', { name: 'Property' });
    fireEvent.change(field, { target: { value: 'sav' } });
    key(field, 'Enter');
    expect(blockOf(session, 'scores01')).toMatchObject({ columns: [{ field: 'saves', formula: 'value' }] });
    fireEvent.click(within(group('Basics')).getByRole('radio', { name: 'Labels at the side' }));
    expect(blockOf(session, 'scores01')).toMatchObject({ orientation: 'table' });
    expect(session.steps).toBe(3);
  });

  it('changes what a List\'s items are, turning the block in one step and keeping its words', () => {
    const session = new FakeSession(template([{ id: 'list0001', type: 'entries', field: '', heading: 'Actions' }]));
    const { frame } = mountEditor(session);
    fireEvent.click(frame('list0001'));
    expect(inspector().querySelector('.atlas-te-insp__type')?.textContent).toBe('List');
    choose(group('Basics'), 'Each item is', 'A word');
    expect(blockOf(session, 'list0001')).toMatchObject({ type: 'tags', label: 'Actions', look: 'comma' });
    expect(session.steps).toBe(1);
    choose(group('Basics'), 'Style', 'Numbered');
    expect(blockOf(session, 'list0001')).toMatchObject({ type: 'tags', look: 'numbered' });
  });

  it('takes a Heading\'s text from a property or has it typed', () => {
    const session = new FakeSession(template([{ id: 'head0001', type: 'heading', text: 'Speed', level: 'section' }], [{ key: 'speed', label: 'Speed', type: 'text' }]));
    const { frame } = mountEditor(session);
    fireEvent.click(frame('head0001'));
    expect(within(group('Basics')).getByRole('textbox', { name: 'Heading' })).toBeTruthy();
    fireEvent.click(within(group('Basics')).getByRole('radio', { name: 'From a property' }));
    expect(blockOf(session, 'head0001')).toEqual({ id: 'head0001', type: 'title', field: 'speed', level: 2 });
    fireEvent.click(within(group('Basics')).getByRole('radio', { name: 'Typed' }));
    expect(blockOf(session, 'head0001')).toEqual({ id: 'head0001', type: 'heading', text: 'Speed', level: 'section' });
    expect(session.steps).toBe(2);
  });

  it('asks one block at a time', () => {
    const { frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    fireEvent.click(frame('stat-hp1'), { shiftKey: true });
    expect(within(inspector()).getByText('Select one block to change its settings.')).toBeTruthy();
  });

  it('replaces a preserved script with a block of the catalogue', () => {
    const session = new FakeSession(template([{ id: 'script01', type: 'script', summary: 'Rolls a d20', fs: { type: 'javascript' } }]));
    const { frame } = mountEditor(session);
    fireEvent.click(frame('script01'));
    expect(within(group('Basics')).getByText(/Rolls a d20/)).toBeTruthy();
    choose(group('Basics'), 'Replace with', 'Value');
    expect(session.template.layout.blocks.map((block) => block.type)).toEqual(['stat']);
    expect(session.steps).toBe(1);
  });

  it('puts Track blocks in place of a script that drew tracks, in one step', () => {
    const code = 'for (let i = 0; i < monster.hp; i++) el.createEl("input", { type: "checkbox" });';
    const session = new FakeSession(template([{ id: 'script01', type: 'script', summary: 'Hp tracks drawn with JavaScript', fs: { type: 'javascript', code } }]));
    const { frame } = mountEditor(session);
    fireEvent.click(frame('script01'));
    fireEvent.click(within(group('Basics')).getByRole('button', { name: 'Replace with Track blocks' }));
    expect(session.template.layout.blocks).toEqual([expect.objectContaining({ type: 'track', field: 'hp', look: 'boxes' })]);
    expect(fieldOf(session, 'hp')).toMatchObject({ type: 'number' });
    expect(session.steps).toBe(1);
  });

  it('offers no Track blocks for a script that draws no tracks', () => {
    const session = new FakeSession(template([{ id: 'script01', type: 'script', summary: 'Rolls a d20', fs: { type: 'javascript' } }]));
    const { frame } = mountEditor(session);
    fireEvent.click(frame('script01'));
    expect(within(group('Basics')).queryByRole('button', { name: 'Replace with Track blocks' })).toBeNull();
  });
});

describe('the Rename key dialog', () => {
  it('renames the key in the template only, keeping the old one as a former key', () => {
    const { session, frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    fireEvent.click(within(open('Property')).getByRole('button', { name: 'Rename…' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename key' });
    const input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'New key' });
    fireEvent.change(input, { target: { value: 'hp' } });
    expect(within(dialog).getByText('Another field already uses “hp”.')).toBeTruthy();
    expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Rename' }).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'armor_class' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(fieldOf(session, 'armor_class')).toMatchObject({ formerKeys: ['ac'] });
    expect(blockOf(session, 'stat-ac1')).toMatchObject({ field: 'armor_class' });
    expect(session.steps).toBe(1);
    expect(screen.queryByRole('dialog', { name: 'Rename key' })).toBeNull();
    expect(within(group('Property')).getByText('Also reads “ac” from statblocks not yet moved over.')).toBeTruthy();
  });
});
