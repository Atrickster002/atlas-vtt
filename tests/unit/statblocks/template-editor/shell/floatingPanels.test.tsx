import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { FIRST_RUN_DOCK, loadDockPrefs, saveDockPrefs } from '../../../../../src/app/statblocks/editor/template-editor/dock/dockPrefs';
import { mountEditor, openDock } from '../sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const root = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-te')!;

describe('the template editor as the note view', () => {
  it('draws the card in the note view\'s panel, beside a rendered sample note', () => {
    mountEditor();
    const row = document.querySelector('.atlas-te-row')!;
    const note = row.querySelector('.atlas-te-note .markdown-reading-view .markdown-preview-view.markdown-rendered')!;
    expect(note.querySelector('.inline-title')?.textContent).toBe('Creature name');
    const panel = row.querySelector('.atlas-sb-note-panel')!;
    expect(panel.querySelector(':scope > .atlas-sb-note-panel__handle')).not.toBeNull();
    const card = panel.querySelector('.atlas-sb-note-panel__scroll > .atlas-sb-pane > .atlas-sb-pane-body > .atlas-sb-pane-card')!;
    expect(card.querySelector('.atlas-te-stage > .atlas-statblock.atlas-sb-sheet.is-editing')).not.toBeNull();
    expect(panel.querySelector('.atlas-sb-pane > .atlas-sb-pane-header.atlas-te-capsule')).not.toBeNull();
  });

  it('shows no side pane or inspector until asked: the dock opens one panel at a time, Escape puts it away', async () => {
    mountEditor();
    expect(document.querySelector('.atlas-te-floating')).toBeNull();
    const add = openDock('Add');
    expect(within(add).getByRole('combobox', { name: 'Find a block' })).toBeTruthy();
    openDock('Structure');
    expect(document.querySelectorAll('.atlas-te-dock-panel')).toHaveLength(1);
    expect(screen.getByRole('tree')).toBeTruthy();
    fireEvent.keyDown(root(), { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('.atlas-te-dock-panel')).toBeNull());
  });

  it('opens a dock panel with Mod+Alt and its digit', () => {
    mountEditor();
    fireEvent.keyDown(root(), { key: '¡', code: 'Digit3', metaKey: true, altKey: true });
    expect(screen.getByRole('dialog', { name: 'Properties' })).toBeTruthy();
  });

  it('keeps a pinned panel through Escape and a press outside', () => {
    mountEditor();
    const panel = openDock('Template');
    act(() => within(panel).getByRole('button', { name: 'Pin open' }).click());
    fireEvent.keyDown(root(), { key: 'Escape' });
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog', { name: 'Template' })).toBeTruthy();
  });

  it('closes an unpinned panel on a press outside it, but not on a press on the card', async () => {
    const { frame } = mountEditor();
    openDock('Structure');
    fireEvent.pointerDown(frame('stat-ac1'));
    expect(screen.getByRole('dialog', { name: 'Structure' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Structure' })).toBeNull());
  });

  it('opens Settings for the selected block with Shift+Enter, follows the selection, and closes with Escape', async () => {
    const { frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    fireEvent.keyDown(frame('stat-ac1'), { key: 'Enter', shiftKey: true });
    const settings = screen.getByRole('dialog', { name: 'Settings' });
    expect(settings.querySelector('.atlas-te-insp__name')?.textContent).toBe('Armor class');
    fireEvent.click(frame('stat-hp1'));
    expect([...settings.querySelectorAll('.atlas-te-insp__name')].at(-1)?.textContent).toBe('Hit points');
    fireEvent.keyDown(frame('stat-hp1'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull());
    expect(frame('stat-hp1').getAttribute('data-te-selected')).toBe('primary');
  });
});

describe('the dock as this device left it', () => {
  it('opens Add pinned the first time, then as it was left', () => {
    const app = new App();
    expect(loadDockPrefs(app)).toEqual(FIRST_RUN_DOCK);
    saveDockPrefs(app, { open: 'structure', pinned: false, firstRun: false });
    expect(loadDockPrefs(app)).toEqual({ open: 'structure', pinned: false, firstRun: false });
    app.saveLocalStorage('atlas-vtt-template-dock', { open: 'nonsense', pinned: 'yes' });
    expect(loadDockPrefs(app)).toEqual({ open: null, pinned: false, firstRun: false });
  });
});
