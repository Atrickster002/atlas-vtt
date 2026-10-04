import React from 'react';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fieldChoiceGroups, newFieldKey, withChosenField } from '../../../../src/app/statblocks/editor/template-editor/inspector/fieldChoices';
import { withMeaning } from '../../../../src/app/statblocks/editor/template-editor/inspector/blockEdits';
import { conditionFor } from '../../../../src/app/statblocks/editor/template-editor/inspector/ConditionBuilder';
import { BasicsGroup } from '../../../../src/app/statblocks/editor/template-editor/inspector/BasicsGroup';
import { useTemplateEditor } from '../../../../src/app/statblocks/editor/template-editor/editorContext';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, template } from './editorKit';
import { key, renderInEditor } from './sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const USED = new Map([['speed', 41], ['senses', 12], ['ac', 30], ['languages', 7]]);

describe('the field picker\'s choices', () => {
  const base = sampleTemplate();

  it('offers this template\'s fields of the types the place takes, the collection\'s other keys, and a new field', () => {
    const groups = fieldChoiceGroups(base, '', ['number'], USED, true);
    expect(groups.map((group) => group.label)).toEqual(['This template', 'Used in this collection']);
    expect(groups[0]?.choices.map((choice) => choice.key)).toEqual(['ac', 'hp']);
    // `speed` and `ac` are the template's already; the most used first.
    expect(groups[1]?.choices.map((choice) => choice.key)).toEqual(['senses', 'languages']);
    const typed = fieldChoiceGroups(base, 'Swim speed', null, USED, true);
    expect(typed.map((group) => group.id)).toEqual(['new']);
    expect(typed[0]?.choices[0]).toEqual({ kind: 'new', key: 'swim_speed', label: 'Swim speed' });
  });

  it('finds by label or key, and offers no new field for a label the template has', () => {
    // A new field named "armor" would take the conventional `ac`, which is taken.
    expect(fieldChoiceGroups(base, 'armor', null, USED, true).flatMap((group) => group.choices).map((choice) => choice.key)).toEqual(['ac', 'ac_2']);
    expect(fieldChoiceGroups(base, 'hit points', null, USED, true).map((group) => group.id)).toEqual(['template']);
    expect(fieldChoiceGroups(base, 'sen', null, USED, false).map((group) => group.id)).toEqual([]);
  });

  it('gives a new field the collection\'s key where its label names one', () => {
    expect(newFieldKey(base, 'Senses', USED)).toBe('senses');
    expect(newFieldKey(template([], [{ key: 'senses', label: 'Senses', type: 'text' }]), 'Senses', USED)).toBe('senses_2');
    expect(newFieldKey(base, 'Armor Class', USED)).toBe('ac_2');
  });

  it('adds the field a choice names, once', () => {
    const chosen = withChosenField(base, { kind: 'collection', key: 'senses', label: 'Senses', count: 12 }, 'text');
    expect(chosen?.key).toBe('senses');
    expect(chosen?.template.fields.at(-1)).toEqual({ key: 'senses', label: 'Senses', type: 'text' });
    expect(withChosenField(base, { kind: 'collection', key: 'speed', label: 'Speed', count: 41 }, 'text')).toEqual({ template: base, key: 'speed' });
    expect(withChosenField(base, { kind: 'field', key: 'ac', label: 'Armor class', type: 'number' }, 'text')?.template).toBe(base);
    expect(withChosenField(base, { kind: 'new', key: 'tags', label: 'Tags' }, 'text')).toBeNull();
  });
});

function unbound(): StatblockTemplate {
  const base = sampleTemplate();
  return { ...base, layout: { ...base.layout, blocks: [...base.layout.blocks, { id: 'stat-new', type: 'stat', field: '', look: 'run-in' }] } };
}

function mountContent(session: FakeSession, id: string): void {
  function Content(): React.JSX.Element | null {
    const current = useTemplateEditor().snapshot.template;
    const block = findBlock(current.layout.blocks, id)?.block;
    return block ? <BasicsGroup block={block} template={current} session={session} readOnly={false} parent={null} /> : null;
  }
  renderInEditor(session, <Content />, { collectionKeys: USED });
}

describe('the property picker in Settings', () => {
  it('opens its three groups and binds a block to a key the collection uses, in one step', () => {
    const session = new FakeSession(unbound());
    mountContent(session, 'stat-new');
    const picker = screen.getByRole('combobox', { name: 'Shows' });
    fireEvent.change(picker, { target: { value: 's' } });
    const list = screen.getByRole('listbox', { name: 'Properties' });
    expect(within(list).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['This template', 'Used in this collection', 'New property']);
    expect(within(list).getByText('Speed', { selector: '.atlas-te-choices__label' }).closest('[role="group"]')?.getAttribute('aria-label')).toBe('This template');
    expect(within(list).getByText('Senses', { selector: '.atlas-te-choices__label' }).closest('[role="group"]')?.getAttribute('aria-label')).toBe('Used in this collection');
    fireEvent.change(picker, { target: { value: 'sen' } });
    key(picker, 'Enter');
    expect(findBlock(session.template.layout.blocks, 'stat-new')?.block).toMatchObject({ field: 'senses' });
    expect(session.template.fields.at(-1)).toEqual({ key: 'senses', label: 'Senses', type: 'text' });
    expect(session.steps).toBe(1);
    expect(screen.getByText(/In 12 statblocks/).textContent).toBe('In 12 statblocks of this collection.');
  });

  it('makes a new property as typed', () => {
    const session = new FakeSession(unbound());
    mountContent(session, 'stat-new');
    const picker = screen.getByRole('combobox', { name: 'Shows' });
    fireEvent.change(picker, { target: { value: 'Swim speed' } });
    fireEvent.click(screen.getByText('New property “Swim speed”'));
    expect(findBlock(session.template.layout.blocks, 'stat-new')?.block).toMatchObject({ field: 'swim_speed' });
    expect(session.template.fields.at(-1)).toEqual({ key: 'swim_speed', label: 'Swim speed', type: 'text' });
    expect((picker as HTMLInputElement).value).toBe('Swim speed');
  });

  it('closes with Escape and shows the bound field again', () => {
    const session = new FakeSession(sampleTemplate());
    mountContent(session, 'stat-ac1');
    const picker = screen.getByRole<HTMLInputElement>('combobox', { name: 'Shows' });
    expect(picker.value).toBe('Armor class');
    key(picker, 'ArrowDown');
    expect(screen.getByRole('listbox', { name: 'Properties' })).toBeTruthy();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { picker.dispatchEvent(escape); });
    expect(escape.defaultPrevented).toBe(true);
    expect(screen.queryByRole('listbox', { name: 'Properties' })).toBeNull();
    expect(picker.value).toBe('Armor class');
    expect(session.steps).toBe(0);
  });
});

describe('meanings and conditions', () => {
  it('moves a meaning to the field that takes it, one field per meaning', () => {
    const base = template([], [
      { key: 'hp', label: 'Hit points', type: 'number', meaning: 'hit-points' },
      { key: 'vigor', label: 'Vigor', type: 'number' },
    ]);
    const moved = withMeaning(base, 'vigor', 'hit-points');
    expect(moved.fields.map((entry) => entry.meaning)).toEqual([undefined, 'hit-points']);
    expect(withMeaning(moved, 'vigor', undefined).fields.every((entry) => entry.meaning === undefined)).toBe(true);
  });

  it('keeps a condition\'s value where the new test still compares one', () => {
    expect(conditionFor('hp', 'present', undefined)).toEqual({ field: 'hp', is: 'present' });
    expect(conditionFor('hp', 'equal', { field: 'hp', is: 'not-equal', value: 'swarm' })).toEqual({ field: 'hp', is: 'equal', value: 'swarm' });
    expect(conditionFor('hp', 'above', { field: 'hp', is: 'equal', value: '12' })).toEqual({ field: 'hp', is: 'above', value: 12 });
    expect(conditionFor('hp', 'below', { field: 'hp', is: 'equal', value: 'swarm' })).toEqual({ field: 'hp', is: 'below', value: 0 });
  });
});
