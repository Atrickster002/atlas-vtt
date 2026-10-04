import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { blockOf, NOTE_PATH, renderPane, type PaneHarness } from './paneKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const apps: App[] = [];
afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

const WARDEN = {
  statblock: true,
  'atlas-template': 'builtin:generic-creature',
  name: 'Marsh Warden',
  type: 'plant',
  hp: 14,
  actions: [{ name: 'Bite', desc: 'It bites.' }, { name: 'Lash', desc: 'It lashes.' }],
};

async function pane(frontmatter: Record<string, unknown> = WARDEN): Promise<PaneHarness> {
  const harness = await renderPane({ frontmatter });
  apps.push(harness.app);
  return harness;
}

const focusedLabel = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null;

describe('the statblock pane over a native note', () => {
  it('renders the card with prompts in place of empty values', async () => {
    const { result } = await pane();
    const speed = blockOf(result.container, 'gcspeed0');
    expect(speed.querySelector('.atlas-sb-prompt')?.textContent).toBe('Add speed');
    expect(speed.getAttribute('role')).toBe('button');
    expect(speed.getAttribute('aria-label')).toBe('Edit Speed');
    expect(blockOf(result.container, 'gctitle0').textContent).toBe('Marsh Warden');
  });

  it('writes a committed number with the value the edit started from', async () => {
    const { result, writer } = await pane();
    fireEvent.click(blockOf(result.container, 'gchp0000'));
    const input = screen.getByRole('textbox', { name: 'Hit Points' });
    expect((input as HTMLInputElement).value).toBe('14');
    fireEvent.change(input, { target: { value: '18' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(writer.patches()).toEqual([{ op: 'set', path: ['hp'], base: 14, next: 18 }]);
    expect(screen.queryByRole('textbox', { name: 'Hit Points' })).toBeNull();
  });

  it('keeps text that does not parse as typed, and flags it', async () => {
    const { result, writer } = await pane();
    fireEvent.click(blockOf(result.container, 'gchp0000'));
    const input = screen.getByRole('textbox', { name: 'Hit Points' });
    fireEvent.change(input, { target: { value: '1/4' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(writer.patches()).toEqual([{ op: 'set', path: ['hp'], base: 14, next: '1/4' }]);
  });

  it('reverts on Escape and writes nothing', async () => {
    const { result, writer } = await pane();
    fireEvent.click(blockOf(result.container, 'gchp0000'));
    const input = screen.getByRole('textbox', { name: 'Hit Points' });
    fireEvent.change(input, { target: { value: '99' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }); });
    expect(writer.writes).toEqual([]);
    expect(screen.queryByRole('textbox', { name: 'Hit Points' })).toBeNull();
    expect(blockOf(result.container, 'gchp0000').textContent).toContain('14');
  });

  it('moves with Tab in the template\'s field order, empty values included', async () => {
    const { result } = await pane();
    fireEvent.click(blockOf(result.container, 'gctitle0'));
    expect(focusedLabel()).toBe('Name');
    const order: Array<string | null> = [];
    for (let step = 0; step < 4; step += 1) {
      await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'Tab' }); });
      order.push(focusedLabel());
    }
    // The portrait is the token socket's: Tab passes it by.
    expect(order).toEqual(['Size', 'Type', 'Level', 'Armor']);
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true }); });
    expect(focusedLabel()).toBe('Level');
  });

  it('shows a conflict when the note changed meanwhile, and keeps mine on request', async () => {
    const { result, writer, source } = await pane();
    writer.answer = (patches) => ({ applied: [], conflicts: [...patches], backend: 'editor', problem: null });
    fireEvent.click(blockOf(result.container, 'gchp0000'));
    const input = screen.getByRole('textbox', { name: 'Hit Points' });
    fireEvent.change(input, { target: { value: '20' } });
    act(() => source.set(NOTE_PATH, { ...WARDEN, hp: 18 }));
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });

    const chip = screen.getByRole('group', { name: 'Hit Points conflict' });
    expect(chip.textContent).toContain('Changed in the note: 14 → 18');
    writer.answer = (patches) => ({ applied: [...patches], conflicts: [], backend: 'editor', problem: null });
    // A click focuses the button it lands on.
    const keep = within(chip).getByRole('button', { name: 'Keep mine' });
    keep.focus();
    await act(async () => { fireEvent.click(keep); });
    expect(writer.writes.at(-1)?.patches).toEqual([{ op: 'set', path: ['hp'], base: 18, next: 20 }]);
    expect(screen.queryByRole('group', { name: 'Hit Points conflict' })).toBeNull();
    // The chip goes with its answer; focus stays on the value it was about.
    expect(document.activeElement).toBe(blockOf(result.container, 'gchp0000'));
  });

  it('drops a conflict for the note\'s value without writing', async () => {
    const { result, writer } = await pane();
    writer.answer = (patches) => ({ applied: [], conflicts: [...patches], backend: 'editor', problem: null });
    fireEvent.click(blockOf(result.container, 'gchp0000'));
    const input = screen.getByRole('textbox', { name: 'Hit Points' });
    fireEvent.change(input, { target: { value: '20' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    const writes = writer.writes.length;
    const notes = screen.getByRole('button', { name: 'Use the note\'s' });
    notes.focus();
    fireEvent.click(notes);
    expect(screen.queryByRole('group', { name: 'Hit Points conflict' })).toBeNull();
    expect(writer.writes.length).toBe(writes);
    expect(document.activeElement).toBe(blockOf(result.container, 'gchp0000'));
  });

  it('edits an entry by its path and moves it with Alt+↓', async () => {
    const { result, writer } = await pane();
    const actions = blockOf(result.container, 'gcaction');
    fireEvent.click(actions.querySelectorAll('.atlas-sb-trait')[0]!);
    const name = screen.getAllByRole('textbox', { name: 'Action name' })[0] as HTMLInputElement;
    expect(name.value).toBe('Bite');
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: 'Big bite' } });
    await act(async () => { fireEvent.blur(name); });
    expect(writer.patches()).toEqual([{ op: 'set', path: ['actions', 0, 'name'], base: 'Bite', next: 'Big bite' }]);

    // Focus left the entries: clicking the second one opens them again on it.
    fireEvent.click(blockOf(result.container, 'gcaction').querySelectorAll('.atlas-sb-trait')[1]!);
    expect((document.activeElement as HTMLInputElement).value).toBe('Lash');
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp', altKey: true }); });
    expect(writer.writes.at(-1)?.patches).toEqual([{ op: 'move', list: 'actions', item: WARDEN.actions[1], after: null }]);
  });

  it('commits long text after a second without typing, and stays in the field', async () => {
    const { result, writer } = await pane();
    fireEvent.click(blockOf(result.container, 'gcdesc00'));
    const text = screen.getByRole('textbox', { name: 'Description' });
    vi.useFakeTimers();
    try {
      fireEvent.change(text, { target: { value: 'It waits in the reeds.' } });
      await act(async () => { vi.advanceTimersByTime(999); });
      expect(writer.writes).toEqual([]);
      await act(async () => { vi.advanceTimersByTime(1); });
    } finally {
      vi.useRealTimers();
    }
    expect(writer.patches()).toEqual([{ op: 'set', path: ['description'], base: undefined, next: 'It waits in the reeds.' }]);
    expect(screen.getByRole('textbox', { name: 'Description' })).toBe(text);
  });

  it('adds and removes chips one item at a time', async () => {
    const { result, writer } = await pane({ ...WARDEN, 'atlas-template': 'builtin:draw-steel-monster', keywords: ['Plant'] });
    fireEvent.click(blockOf(result.container, 'dskeywor'));
    const input = screen.getByRole('textbox', { name: 'Add to Keywords' });
    fireEvent.change(input, { target: { value: 'Swamp' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove Plant' })); });
    expect(writer.patches()).toEqual([
      { op: 'insert', list: 'keywords', after: 'Plant', item: 'Swamp' },
      { op: 'remove', list: 'keywords', item: 'Plant' },
    ]);
  });

  it('draws a value the template works out as the card draws it, and says how on hover', async () => {
    const { result } = await pane({ ...WARDEN, 'atlas-template': 'builtin:5e-2024-monster', stats: [10, 14, 12, 8, 10, 6] });
    const initiative = blockOf(result.container, 'b5init00');
    expect(initiative.textContent).toContain('+2 (12)');
    expect(initiative.textContent).not.toContain('ƒ');
    expect(screen.getByText(/Worked out from .*Dex/, { selector: '[hidden]' })).toBeTruthy();
    // A plain fallback ("None") needs no saying.
    expect(blockOf(result.container, 'b5lang00').querySelector('.atlas-sb-pane-derived')).toBeNull();
  });

  it('says how to get a deleted entry back', async () => {
    const { result, writer } = await pane();
    // The ability's menu, by right-click at rest (spec §5.5): the same rows as its handle's.
    fireEvent.contextMenu(blockOf(result.container, 'gcaction').querySelectorAll('.atlas-sb-trait')[0]!);
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: /^Delete Bite/ })); });
    expect(writer.patches()).toEqual([{ op: 'remove', list: 'actions', item: WARDEN.actions[0] }]);
    expect(result.container.querySelector('.atlas-sb-pane-live')?.textContent).toBe('Deleted Bite. Press Ctrl+Z to undo.');
  });

  it('lists the note\'s other properties in the tray and removes one from the note', async () => {
    const { writer } = await pane({ ...WARDEN, tags: ['marsh'], lair: 'Sunken causeway' });
    fireEvent.click(screen.getByRole('button', { name: 'More properties (2)' }));
    expect(screen.getByRole('heading', { name: 'Note' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Not in this template' })).toBeTruthy();
    expect(screen.getByText('marsh')).toBeTruthy();
    const row = screen.getByRole('textbox', { name: 'lair' }).closest('.atlas-sb-pane-tray__row') as HTMLElement;
    await act(async () => { fireEvent.click(within(row).getByRole('button', { name: 'Remove from note' })); });
    expect(writer.patches()).toEqual([{ op: 'delete', path: ['lair'], base: 'Sunken causeway' }]);
  });

  it('runs the focused input\'s commit when the pane closes mid-word', async () => {
    const pendingCommit = { current: null as (() => Promise<void>) | null };
    const harness = await renderPane({ frontmatter: WARDEN, pendingCommit });
    apps.push(harness.app);
    fireEvent.click(blockOf(harness.result.container, 'gchp0000'));
    const input = screen.getByRole('textbox', { name: 'Hit Points' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '30' } });
    await act(async () => { await pendingCommit.current?.(); });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['hp'], base: 14, next: 30 }]);
  });

  it('writes what was typed to its own note when the pane follows its partner to another', async () => {
    const harness = await pane();
    fireEvent.click(blockOf(harness.result.container, 'gchp0000'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Hit Points' }), { target: { value: '22' } });
    await act(async () => { harness.rerender({ notePath: 'Bestiary/Bog Hag.md' }); });
    expect(harness.writer.writes).toEqual([{ path: NOTE_PATH, patches: [{ op: 'set', path: ['hp'], base: 14, next: 22 }] }]);
  });

  it('never writes while it only shows the note', async () => {
    const { writer, app } = await pane();
    await waitFor(() => expect(TemplateLibrary.forApp(app).isLoading()).toBe(false));
    expect(writer.writes).toEqual([]);
    expect(app.vault.process).not.toHaveBeenCalled();
    expect(app.vault.create).not.toHaveBeenCalled();
  });
});
