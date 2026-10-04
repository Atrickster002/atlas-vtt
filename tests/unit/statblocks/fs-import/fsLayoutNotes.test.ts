import { afterEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { adoptStatblocks, layoutsOfNotes, noteFsLayout, notesUsingLayout } from '../../../../src/app/statblocks/fs/fsLayoutNotes';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';
import { MARSH_LAYOUT, PLAIN_LAYOUT, withFsPlugin, withoutFsPlugin } from './fsImportKit';

const fs = (layout?: string, extra = ''): string => `---\nstatblock: true\nname: Bog\n${layout ? `layout: ${layout}\n` : ''}hp: 7\n${extra}---\nThe bog.\n`;
const NOTES = {
  'Bestiary/Bog.md': fs('Marsh layout'),
  'Bestiary/Fen.md': fs('marsh-layout'),
  'Bestiary/Mire.md': fs(),
  'Bestiary/Elsewhere.md': fs('Unknown layout'),
  'Bestiary/Native.md': fs('Marsh layout', 'atlas-template: builtin:generic-creature\n'),
  'Notes/Plain.md': '---\nlayout: Marsh layout\n---\nNot a statblock.\n',
};
const MARSH = { id: 'marsh-layout', name: 'Marsh layout' };

let harness: NoteHarness;
const app = (): App => harness.app as unknown as App;

afterEach(() => {
  withoutFsPlugin(app());
  NoteFieldWriter.release(harness.app);
});

describe('the notes a layout draws', () => {
  it('reads them as Fantasy Statblocks does: the layout named by name or id, else the plugin\'s default', () => {
    harness = noteHarness(NOTES);
    withFsPlugin(app());
    expect(notesUsingLayout(app(), MARSH)).toEqual(['Bestiary/Bog.md', 'Bestiary/Fen.md']);
    // A layout the plugin does not know falls back to its default, as the plugin draws it.
    expect(notesUsingLayout(app(), { id: PLAIN_LAYOUT.id, name: PLAIN_LAYOUT.name })).toEqual(['Bestiary/Elsewhere.md', 'Bestiary/Mire.md']);
    expect(notesUsingLayout(app(), MARSH, ['Bestiary/Fen.md', 'Bestiary/Mire.md'])).toEqual(['Bestiary/Fen.md']);
    expect(noteFsLayout(app(), { statblock: true, layout: 'Marsh layout' })).toBe(MARSH_LAYOUT);
    expect(noteFsLayout(app(), { statblock: true })).toBe(PLAIN_LAYOUT);
  });

  it('reads them by the name they give without the plugin, and none for a note that gives none', () => {
    harness = noteHarness(NOTES);
    expect(notesUsingLayout(app(), MARSH)).toEqual(['Bestiary/Bog.md', 'Bestiary/Fen.md']);
    expect(noteFsLayout(app(), { statblock: true, layout: 'Marsh layout' })).toBeNull();
    expect(layoutsOfNotes(app(), Object.keys(NOTES))).toEqual([
      { layout: { id: 'Marsh layout', name: 'Marsh layout' }, notes: ['Bestiary/Bog.md'] },
      { layout: { id: 'marsh-layout', name: 'marsh-layout' }, notes: ['Bestiary/Fen.md'] },
      { layout: { id: 'Unknown layout', name: 'Unknown layout' }, notes: ['Bestiary/Elsewhere.md'] },
    ]);
  });

  it('groups the statblocks of a collection by the layout that draws them, the most used first', () => {
    harness = noteHarness(NOTES);
    withFsPlugin(app());
    expect(layoutsOfNotes(app(), [...Object.keys(NOTES), 'Bestiary/Bog.md'])).toEqual([
      { layout: MARSH, notes: ['Bestiary/Bog.md', 'Bestiary/Fen.md'] },
      { layout: { id: 'plain-layout', name: 'Plain layout' }, notes: ['Bestiary/Elsewhere.md', 'Bestiary/Mire.md'] },
    ]);
  });
});

describe('adoptStatblocks', () => {
  it('writes atlas-template alone into each note, keeping layout: and every value', async () => {
    harness = noteHarness(NOTES);
    const result = await adoptStatblocks(app(), ['Bestiary/Bog.md', 'Bestiary/Fen.md'], 'marsh-layout-k7m2qa');
    expect(result).toEqual({ switched: ['Bestiary/Bog.md', 'Bestiary/Fen.md'], skipped: [], notReached: [] });
    expect(harness.files.get('Bestiary/Bog.md')).toBe(
      '---\nstatblock: true\nname: Bog\nlayout: Marsh layout\nhp: 7\natlas-template: marsh-layout-k7m2qa\n---\nThe bog.\n',
    );
  });

  it('adopts a note whose atlas-template is empty, as it names no template', async () => {
    harness = noteHarness({ 'Bestiary/Blank.md': fs('Marsh layout', 'atlas-template: ""\n'), 'Bestiary/Bare.md': fs('Marsh layout', 'atlas-template:\n') });
    const result = await adoptStatblocks(app(), ['Bestiary/Bare.md', 'Bestiary/Blank.md'], 'marsh-layout-k7m2qa');
    expect(result).toEqual({ switched: ['Bestiary/Bare.md', 'Bestiary/Blank.md'], skipped: [], notReached: [] });
    // The patcher keeps the value's own quoting.
    expect(harness.files.get('Bestiary/Blank.md')).toContain('atlas-template: "marsh-layout-k7m2qa"\n');
    expect(harness.files.get('Bestiary/Bare.md')).toContain('atlas-template: marsh-layout-k7m2qa\n');
  });

  it('leaves a note that names a template meanwhile, and stops at Cancel', async () => {
    harness = noteHarness(NOTES);
    const cancel = new AbortController();
    const result = await adoptStatblocks(app(), ['Bestiary/Native.md', 'Bestiary/Bog.md', 'Bestiary/Fen.md'], 'marsh-layout-k7m2qa', {
      signal: cancel.signal,
      onProgress: (done) => { if (done === 2) cancel.abort(); },
    });
    expect(result).toEqual({
      switched: ['Bestiary/Bog.md'],
      skipped: [{ path: 'Bestiary/Native.md', reason: 'Its template was changed meanwhile.' }],
      notReached: ['Bestiary/Fen.md'],
    });
    expect(harness.files.get('Bestiary/Native.md')).toBe(NOTES['Bestiary/Native.md']);
    expect(harness.files.get('Bestiary/Fen.md')).toBe(NOTES['Bestiary/Fen.md']);
  });
});
