import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { GESTURE_HINT } from '../../../../src/app/statblocks/editor/template-editor/shell/TemplateFooterLine';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { FakeSession, sampleTemplate, shape, template } from './editorKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom lays nothing out; the label input measures the label's text with a range.
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const host: TemplateEditorHost = { openTemplate: vi.fn(), openNote: vi.fn(), close: vi.fn() };

function setup(session = new FakeSession(sampleTemplate())): { session: FakeSession; frame: (id: string) => HTMLElement } {
  render(
    <TooltipProvider>
      <TemplateEditor session={session} host={host} previewPath={null} onShowWithChange={vi.fn()} collectionId={null} onCollectionChange={vi.fn()} />
    </TooltipProvider>,
  );
  const frame = (id: string): HTMLElement => {
    const element = document.querySelector<HTMLElement>(`.atlas-te-stage [data-block-id="${id}"]`);
    if (!element) throw new Error(`no frame ${id}`);
    return element;
  };
  return { session, frame };
}

const key = (target: Element, name: string, init: KeyboardEventInit = {}): void => {
  fireEvent.keyDown(target, { key: name, ...init });
};

describe('TemplateEditor', () => {
  it('selects the innermost block on click and adds siblings with Shift', () => {
    const { frame } = setup();
    fireEvent.click(frame('stat-ac1'));
    expect(frame('stat-ac1').getAttribute('data-te-selected')).toBe('primary');
    expect(frame('section1').hasAttribute('data-te-selected')).toBe(false);
    fireEvent.click(frame('stat-hp1'), { shiftKey: true });
    expect(frame('stat-ac1').getAttribute('data-te-selected')).toBe('sibling');
    expect(frame('stat-hp1').getAttribute('data-te-selected')).toBe('primary');
  });

  it('walks blocks with the arrows and selects the parent, then nothing, with Escape', () => {
    const { frame } = setup();
    fireEvent.click(frame('stat-ac1'));
    act(() => frame('stat-ac1').focus());
    key(frame('stat-ac1'), 'ArrowDown');
    expect(frame('stat-hp1').getAttribute('data-te-selected')).toBe('primary');
    expect(document.activeElement).toBe(frame('stat-hp1'));
    key(frame('stat-hp1'), 'Escape');
    expect(frame('section1').getAttribute('data-te-selected')).toBe('primary');
    key(frame('section1'), 'Escape');
    expect(document.querySelector('[data-te-selected]')).toBeNull();
  });

  it('deletes with the key, says so, and offers Undo in a toast', async () => {
    const { session, frame } = setup();
    fireEvent.click(frame('stat-ac1'));
    act(() => frame('stat-ac1').focus());
    key(frame('stat-ac1'), 'Delete');
    expect(findBlock(session.template.layout.blocks, 'stat-ac1')).toBeNull();
    expect(document.querySelector('.atlas-te-live')?.textContent).toMatch(/^Deleted Armor class\. Press Ctrl\+Z to undo\./);
    expect(frame('stat-hp1').getAttribute('data-te-selected')).toBe('primary');
    fireEvent.click(within(screen.getByText('Deleted Armor class.').parentElement!).getByRole('button', { name: 'Undo' }));
    expect(shape(session.template.layout.blocks)).toBe(shape(sampleTemplate().layout.blocks));
    await waitFor(() => expect(screen.queryByText('Deleted Armor class.')).toBeNull());
  });

  it('undoes the template with Mod+Z on a block, and leaves Mod+Z to a focused input', () => {
    const { session, frame } = setup();
    fireEvent.click(frame('stat-ac1'));
    act(() => frame('stat-ac1').focus());
    key(frame('stat-ac1'), 'd', { ctrlKey: true, code: 'KeyD' });
    expect(session.steps).toBe(1);
    key(document.activeElement ?? document.body, 'z', { ctrlKey: true, code: 'KeyZ' });
    expect(session.getSnapshot().canUndo).toBe(false);

    fireEvent.doubleClick(frame('stat-hp1'));
    const input = screen.getByRole('textbox', { name: 'Label' });
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(session.getSnapshot().canRedo).toBe(true);
  });

  it('edits a label in place: Enter commits, Escape reverts', () => {
    const { session, frame } = setup();
    fireEvent.doubleClick(frame('stat-ac1'));
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    expect(input.value).toBe('Armor class');
    fireEvent.change(input, { target: { value: 'Armour' } });
    key(input, 'Enter');
    expect(session.template.fields.find((field) => field.key === 'ac')?.label).toBe('Armour');
    expect(screen.queryByRole('textbox', { name: 'Label' })).toBeNull();

    fireEvent.doubleClick(frame('stat-hp1'));
    const again = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    fireEvent.change(again, { target: { value: 'Nope' } });
    key(again, 'Escape');
    expect(session.template.fields.find((field) => field.key === 'hp')?.label).toBe('Hit points');
    expect(session.steps).toBe(1);
  });

  it('moves on to the next label with Tab, committing the first', () => {
    const { session, frame } = setup();
    fireEvent.doubleClick(frame('stat-ac1'));
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    fireEvent.change(input, { target: { value: 'AC' } });
    key(input, 'Tab');
    expect(session.template.fields.find((field) => field.key === 'ac')?.label).toBe('AC');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' }).value).toBe('Hit points');
  });

  it('opens the insert menu with /, inserts on Enter, selects the new block, and names it with Enter', async () => {
    const { session, frame } = setup();
    fireEvent.click(frame('divider1'));
    act(() => frame('divider1').focus());
    key(frame('divider1'), '/');
    const search = screen.getByRole('combobox', { name: 'Find a block' });
    fireEvent.change(search, { target: { value: 'value' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toContain('Value');
    // The exact match is highlighted, though others found are listed above it.
    expect(screen.getByRole('option', { selected: true }).textContent).toBe('Value');
    key(search, 'Enter');
    const added = session.template.layout.blocks.at(-1);
    expect(added?.type).toBe('stat');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a block' })).toBeNull());
    // Inserting never opens the label (spec §6.1): the block is selected, Enter names it.
    expect(screen.queryByRole('textbox', { name: 'Label' })).toBeNull();
    await waitFor(() => expect(document.activeElement?.getAttribute('data-block-id')).toBe(added?.id));
    key(frame(added!.id), 'Enter');
    const label = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    expect(label.value).toBe('Value');
    fireEvent.change(label, { target: { value: 'Initiative' } });
    key(label, 'Enter');
    expect(session.template.layout.blocks.at(-1)).toMatchObject({ type: 'stat', field: 'initiative' });
    expect(session.template.fields.at(-1)).toEqual({ key: 'initiative', label: 'Initiative', type: 'text' });
    expect(session.steps).toBe(2);
    expect(document.querySelector('.atlas-te-live')?.textContent).toBe('Made a new property for it.');
  });

  it('deletes a block just inserted with Delete, since no label is open', async () => {
    const { session, frame } = setup();
    fireEvent.click(frame('divider1'));
    act(() => frame('divider1').focus());
    key(frame('divider1'), '/');
    const search = screen.getByRole('combobox', { name: 'Find a block' });
    fireEvent.change(search, { target: { value: 'list' } });
    key(search, 'Enter');
    const added = session.template.layout.blocks.at(-1);
    expect(added?.type).toBe('entries');
    await waitFor(() => expect(document.activeElement?.getAttribute('data-block-id')).toBe(added?.id));
    key(frame(added!.id), 'Delete');
    expect(session.template.layout.blocks.some((block) => block.id === added?.id)).toBe(false);
    expect(session.steps).toBe(2);
  });

  it('closes the insert menu with Escape, inserting nothing', async () => {
    const { session, frame } = setup();
    fireEvent.click(frame('title001'));
    act(() => frame('title001').focus());
    key(frame('title001'), '/');
    key(screen.getByRole('combobox', { name: 'Find a block' }), 'Escape');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a block' })).toBeNull());
    expect(document.activeElement).toBe(frame('title001'));
    expect(session.steps).toBe(0);
  });

  it('acts from the block toolbar: five controls, Delete and Add below among them', () => {
    const { session, frame } = setup();
    fireEvent.click(frame('stat-ac1'));
    const toolbar = screen.getByRole('toolbar', { name: 'Value toolbar' });
    expect(within(toolbar).getAllByRole('button')).toHaveLength(5);
    fireEvent.click(within(toolbar).getByText('Delete').closest('button')!);
    expect(shape(session.template.layout.blocks)).toContain('section1(stat-hp1)');
    expect(session.steps).toBe(1);
  });

  it('says under the card how to work it, and fills a blank template from its ghost rows', () => {
    const session = new FakeSession(template([]));
    setup(session);
    expect(screen.getByText(GESTURE_HINT)).toBeTruthy();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(expect.arrayContaining(['Name', 'A line under the name', 'A value', 'A list']));
    expect(screen.queryByText('Start like…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'A list' }));
    expect(session.template.layout.blocks[0]?.type).toBe('entries');
  });

  it('edits a built-in like any template, saying first that the change makes your own copy (§9.3)', () => {
    const session = new FakeSession(sampleTemplate(), { path: null, name: '5E (2014 rules)' });
    session.patch({ copyOnWrite: { builtInId: 'builtin:5e-2014-monster', builtInName: '5E (2014 rules)' } });
    const { frame } = setup(session);
    expect(screen.getByText('Built in. Your first change makes your own copy.')).toBeTruthy();
    fireEvent.click(frame('stat-ac1'));
    act(() => frame('stat-ac1').focus());
    key(frame('stat-ac1'), 'Delete');
    expect(session.steps).toBe(1);
  });

  it('saves quietly, and offers Retry after a failure', () => {
    const session = new FakeSession(sampleTemplate());
    setup(session);
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.queryByText('Saving…')).toBeNull();
    act(() => session.patch({ saveState: 'error', saveProblem: "Couldn't save: disk full. Retrying" }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(session.flushes).toBe(1);
  });

  it('offers the choices of a conflict', () => {
    const session = new FakeSession(sampleTemplate(), { conflict: 'changed', saveState: 'conflict' });
    setup(session);
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(session.resolutions).toEqual(['keep-mine']);
  });
});
