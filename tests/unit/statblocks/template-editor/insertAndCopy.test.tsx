import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { builtInLine, switchChipText } from '../../../../src/app/statblocks/editor/template-editor/shell/builtInLine';
import { SwitchStatblocksChip } from '../../../../src/app/statblocks/editor/template-editor/shell/SwitchStatblocksChip';
import { switchTemplates } from '../../../../src/app/statblocks/notes/templateSwitch';
import { bestMatch, findItems, groupItems, insertItems, previewTemplate } from '../../../../src/app/statblocks/editor/template-editor/insertItems';
import { InsertMenu } from '../../../../src/app/statblocks/editor/template-editor/InsertMenu';
import { handleTemplateKey, type KeyboardTarget } from '../../../../src/app/statblocks/editor/template-editor/useTemplateKeyboard';
import { turnIntoPrimitives } from '../../../../src/app/statblocks/model/turnInto';
import { FakeSession, sampleTemplate } from './editorKit';

vi.mock('../../../../src/app/statblocks/notes/templateSwitch', () => ({ switchTemplates: vi.fn(async () => undefined) }));

afterEach(cleanup);

describe('the insert menu\'s items', () => {
  it('lists each primitive once, by group, in plain words', () => {
    const groups = groupItems(insertItems());
    expect(groups.map((group) => group.label)).toEqual(['Text and values', 'Lists and tables', 'Layout', 'Pictures']);
    expect(groups.map((group) => group.items.map((item) => item.label))).toEqual([
      ['Heading', 'Text', 'Value', 'Line'], ['List', 'Table', 'Track'], ['Section', 'Side by side', 'Tabs', 'Divider'], ['Picture'],
    ]);
    expect(insertItems().find((item) => item.label === 'List')?.type).toBe('entries');
    expect(insertItems().find((item) => item.label === 'Heading')?.type).toBe('heading');
    for (const item of insertItems()) expect(item.example, item.label).not.toBe('');
  });

  it('finds items by every word typed, in their name, their line or other words', () => {
    expect(findItems(insertItems(), 'ability scores').map((item) => item.label)).toEqual(['Table']);
    expect(findItems(insertItems(), 'abilities').map((item) => item.label)).toEqual(['List']);
    expect(findItems(insertItems(), 'zzz')).toEqual([]);
  });

  it('starts the keys on the item named exactly what was typed, else on one whose name starts with it', () => {
    const items = findItems(insertItems(), 'text');
    expect(items.length).toBeGreaterThan(1);
    expect(items[bestMatch(items, 'text')]?.label).toBe('Text');
    const values = findItems(insertItems(), 'val');
    expect(values[bestMatch(values, 'val')]?.label).toBe('Value');
  });

  it('turns blocks only into other primitives of their sort, each primitive once', () => {
    expect(turnIntoPrimitives('row')).toEqual(['section', 'tabs']);
    expect(turnIntoPrimitives('stat')).not.toContain('side-by-side');
    expect(turnIntoPrimitives('stat')).toContain('track');
    expect(turnIntoPrimitives('tags')).toEqual(['heading', 'text', 'value', 'line', 'table', 'track', 'divider', 'picture']);
    expect(turnIntoPrimitives('title')).not.toContain('heading');
  });
});

describe('a built-in and its copy in the footer (spec §9.1, §9.3)', () => {
  it('says where the first change goes before it is made', () => {
    expect(builtInLine({ builtInName: '5E (2014 rules)', copy: null, fromNote: null })).toBe('Built in. Your first change makes your own copy.');
    expect(builtInLine({ builtInName: '5E (2014 rules)', copy: null, fromNote: 'Aboleth' })).toBe('Built in. Your first change makes your own copy for Aboleth.');
    expect(builtInLine({ builtInName: '5E (2014 rules)', copy: { name: '5E (2014 rules) copy', usage: 3 }, fromNote: 'Aboleth' }))
      .toBe('Built in. Your changes go to your copy of 5E (2014 rules) · 3 statblocks.');
  });

  it('switches the statblocks still on the built-in only after naming them and being asked', async () => {
    expect(switchChipText('5E (2014 rules)', 11)).toBe('11 more on 5E (2014 rules) · Switch…');
    render(<SwitchStatblocksChip app={{} as App} from="builtin:x" to="copy-abc123" builtInName="X" notes={['A.md', 'B.md']} />);
    fireEvent.click(screen.getByRole('button', { name: '2 more on X · Switch…' }));
    expect(screen.getByRole('dialog').textContent).toContain('AB');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(switchTemplates).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '2 more on X · Switch…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch them' }));
    expect(switchTemplates).toHaveBeenCalledWith({}, [{ path: 'A.md', from: 'builtin:x' }, { path: 'B.md', from: 'builtin:x' }], 'copy-abc123');
  });
});

describe('the keys from the view\'s scope', () => {
  function target(session: FakeSession, root: HTMLElement): KeyboardTarget {
    return {
      rootRef: { current: root }, session, selection: [], drawn: () => true, select: vi.fn(), settle: vi.fn(),
      editLabel: vi.fn(), openInsert: vi.fn(), openMenu: vi.fn(), clipOwner: {},
    };
  }

  it('undoes from the scope where focus left the editor\'s elements, and never inside an input', () => {
    const session = new FakeSession(sampleTemplate());
    session.apply((source) => ({ ...source, description: 'changed' }));
    const root = document.body.createDiv();
    const undo = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(handleTemplateKey(target(session, root), undo, false)).toBe(false);
    expect(handleTemplateKey(target(session, root), undo, false, true)).toBe(true);
    expect(session.getSnapshot().canUndo).toBe(false);

    const input = root.createEl('input', { type: 'text' });
    input.focus();
    expect(handleTemplateKey(target(session, root), new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }), false, true)).toBe(false);
    root.remove();
  });
});
