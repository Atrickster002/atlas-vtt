import '../setup/obsidianDom';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { BODY_PLACEHOLDER } from '../../src/app/statblocks/editor/template-editor/shell/TemplateBodyColumn';
import { SAVE_HINT } from '../../src/app/statblocks/editor/template-editor/shell/TemplateCapsule';
import { FakeSession, sampleTemplate } from '../unit/statblocks/template-editor/editorKit';
import { frames, mount, px, useEditorStyles } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
  splitDiceSegments: (text: string) => [{ text, dice: false }],
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

/**
 * The template's note column with the real stylesheet. Obsidian's own editor
 * cannot run here: the column's stand-in is measured as it is drawn, and the
 * note view is the element tree Obsidian gives a Markdown view, put where the
 * column hosts it. What the editor does is checked in Obsidian itself.
 */
const NOTE_FONT = 'Georgia, serif';
const LINE_WIDTH = 640;
const MARGIN = 32;

function mountNote(session: FakeSession, width = 1400): HTMLElement {
  const root = mount(session, width);
  const editor = root.closest<HTMLElement>('.atlas-statblock-editor')!;
  editor.style.setProperty('--font-text', NOTE_FONT);
  editor.style.setProperty('--file-line-width', `${LINE_WIDTH}px`);
  editor.style.setProperty('--file-margins', `${MARGIN}px`);
  editor.style.setProperty('--line-height-normal', '1.5');
  return root;
}

/** A Markdown view as Obsidian builds one, showing an empty note, in the column's host as the column puts it there. */
function hostNoteView(root: HTMLElement, lines: string[]): HTMLElement {
  const column = root.querySelector<HTMLElement>('.atlas-te-note__editor')!;
  for (const child of column.children) (child as HTMLElement).style.display = 'none';
  const host = column.createDiv({ cls: 'atlas-te-note__host', attr: { 'data-te-hosted-note': '' } });
  host.style.setProperty('--atlas-te-note-placeholder', JSON.stringify(BODY_PLACEHOLDER));
  const view = host.createDiv({ cls: 'workspace-leaf-content atlas-embedded-leaf-view atlas-embedded-leaf-view--fill-editor atlas-te-note__view' });
  view.createDiv({ cls: 'view-header', text: 'Marsh creature' });
  const source = view.createDiv({ cls: 'view-content' }).createDiv({ cls: 'markdown-source-view mod-cm6 is-readable-line-width' });
  const scroller = source.createDiv({ cls: 'cm-editor' }).createDiv({ cls: 'cm-scroller' });
  const sizer = scroller.createDiv({ cls: 'cm-sizer' });
  sizer.createDiv({ cls: 'inline-title', text: 'Marsh creature' });
  sizer.createDiv({ cls: 'metadata-container', text: 'Properties' });
  const content = sizer.createDiv({ cls: 'cm-content', attr: { contenteditable: 'true' } });
  for (const text of lines) {
    const line = content.createDiv({ cls: 'cm-line' });
    if (text === '') line.createEl('br');
    else line.setText(text);
  }
  return view;
}

describe('the template\'s note column', () => {
  useEditorStyles();
  afterEach(cleanup);

  it('stands where a note\'s text starts, with the note\'s font, readable line and margins, before the dock', async () => {
    const root = mountNote(new FakeSession(sampleTemplate()));
    await frames(3);
    const note = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
    const panel = root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect();
    expect(note.right, 'the note column ends where the panel begins').toBeCloseTo(panel.left, 0);

    const standIn = root.querySelector<HTMLElement>('.atlas-te-note__stand-in')!;
    const line = root.querySelector<HTMLElement>('.atlas-te-note__line')!;
    expect(line.textContent).toBe(BODY_PLACEHOLDER);
    expect(getComputedStyle(standIn).fontFamily).toBe(NOTE_FONT);
    const room = standIn.getBoundingClientRect();
    const left = room.left + px(getComputedStyle(standIn).paddingLeft);
    const right = room.right - px(getComputedStyle(standIn).paddingRight);
    expect(px(getComputedStyle(standIn).paddingLeft)).toBe(MARGIN);
    const text = line.getBoundingClientRect();
    expect(text.width).toBeCloseTo(Math.min(LINE_WIDTH, right - left), 0);
    expect(text.left - left).toBeCloseTo(right - text.right, 0);
    expect(text.top - room.top).toBeCloseTo(MARGIN, 0);
    expect(text.right, 'the text ends before the dock').toBeLessThanOrEqual(root.querySelector('.atlas-te-dock')!.getBoundingClientRect().left);
    expect(standIn.getBoundingClientRect().height, 'a click anywhere in the column starts the note').toBeCloseTo(note.height, 0);
  });

  it('gives Obsidian\'s note view the whole column, without its header, title or properties, its text ending before the dock', async () => {
    const root = mountNote(new FakeSession(sampleTemplate()));
    await frames(2);
    const view = hostNoteView(root, ['## Lair', 'Where it sleeps.']);
    await frames(2);
    const column = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
    const shown = view.getBoundingClientRect();
    expect([shown.left, shown.top, shown.right, shown.bottom]).toEqual([column.left, column.top, column.right, column.bottom]);
    expect(getComputedStyle(view.querySelector('.view-header')!).display).toBe('none');
    expect(getComputedStyle(view.querySelector('.inline-title')!).display).toBe('none');
    expect(getComputedStyle(view).getPropertyValue('--metadata-display-editing').trim()).toBe('none');
    const scroller = view.querySelector<HTMLElement>('.cm-scroller')!;
    const textEnd = scroller.getBoundingClientRect().right - px(getComputedStyle(scroller).paddingInlineEnd);
    expect(textEnd, 'the text ends before the dock').toBeLessThanOrEqual(root.querySelector('.atlas-te-dock')!.getBoundingClientRect().left);
    expect(getComputedStyle(view.querySelector('.cm-line')!, '::before').content).toBe('none');
  });

  it('says what to write in an empty note', async () => {
    const root = mountNote(new FakeSession(sampleTemplate()));
    await frames(2);
    const view = hostNoteView(root, ['']);
    await frames(1);
    expect(getComputedStyle(view.querySelector('.cm-line')!, '::before').content).toBe(JSON.stringify(BODY_PLACEHOLDER));
  });

  it('tells over Save what it covers, also while there is nothing to save', async () => {
    const root = mountNote(new FakeSession(sampleTemplate()));
    await frames(2);
    const save = root.querySelector<HTMLElement>('.atlas-te-capsule__save')!;
    expect(save.getAttribute('aria-disabled')).toBe('true');
    await userEvent.hover(save);
    await expect.poll(() => document.querySelector('.tooltip-inner')?.textContent, { timeout: 2000 }).toBe(SAVE_HINT);
  });
});
