import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenStatblockLinkService } from '../../../../src/app/services/TokenStatblockLinkService';
import { createStatblockNote, noteFileName, shownName, statblockNoteText } from '../../../../src/app/statblocks/notes/createStatblockNote';
import { statblockSourceFromText } from '../../../../src/app/statblocks/notes/statblockSource';
import { noteHarness } from './noteHarness';

// The link service is tested on its own; its imports reach the canvas renderer.
vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: vi.fn() } }));

const TEMPLATE = 'builtin:generic-creature';

function linkService(): { linkTokenToStatblock: ReturnType<typeof vi.fn> } {
  const service = { linkTokenToStatblock: vi.fn(async () => true) };
  vi.mocked(TokenStatblockLinkService.getInstance).mockReturnValue(service as unknown as TokenStatblockLinkService);
  return service;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('statblockNoteText', () => {
  it('marks a native statblock with its template, name and token art, and leaves the body empty', () => {
    const text = statblockNoteText({ name: 'Marsh Warden', templateId: TEMPLATE, tokenImagePath: 'art/warden.webp' });

    expect(text).toBe('---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Marsh Warden\nimage: art/warden.webp\n---\n');
    expect(statblockSourceFromText(text)).toEqual({ kind: 'atlas', templateId: TEMPLATE });
  });

  it('quotes a name YAML would read as something else', () => {
    const text = statblockNoteText({ name: 'Yes: no #1', templateId: TEMPLATE });

    expect(text).toContain('name: "Yes: no #1"');
  });
});

describe('noteFileName', () => {
  it('replaces what a file name cannot carry', () => {
    expect(noteFileName(' Orc: chief [elite] ')).toBe('Orc- chief -elite-');
    expect(noteFileName('.hidden')).toBe('hidden');
    expect(noteFileName('   ')).toBe('New statblock');
  });
});

describe('createStatblockNote', () => {
  it('creates the note in the role folder, numbering a taken name in any letter case', async () => {
    linkService();
    const harness = noteHarness({ 'Bestiary/Goblin.md': 'taken', 'Bestiary/goblin 2.md': 'taken' });

    const { file, linked } = await createStatblockNote(harness.app, { name: 'Goblin', templateId: TEMPLATE, folder: 'Bestiary' });

    expect(file.path).toBe('Bestiary/Goblin 3.md');
    expect(linked).toBe(false);
    expect(harness.files.get('Bestiary/Goblin 3.md')).not.toContain('atlas-statblock');
  });

  it('creates a missing role folder, and uses Obsidian\'s folder for new notes without one', async () => {
    linkService();
    const harness = noteHarness({});

    expect((await createStatblockNote(harness.app, { name: 'Wolf', templateId: TEMPLATE, folder: 'World/Beasts' })).file.path).toBe('World/Beasts/Wolf.md');
    expect((await createStatblockNote(harness.app, { name: 'Bear', templateId: TEMPLATE })).file.path).toBe('Bear.md');
    expect(harness.folders.has('World/Beasts')).toBe(true);
  });

  it('writes the token\'s art and links the token to the new note', async () => {
    const service = linkService();
    const harness = noteHarness({});

    const { file, linked } = await createStatblockNote(harness.app, { name: 'Warden', templateId: TEMPLATE, folder: 'Bestiary', tokenImagePath: 'art/warden.webp' });

    expect(linked).toBe(true);
    expect(harness.files.get(file.path)).toContain('image: art/warden.webp');
    expect(service.linkTokenToStatblock).toHaveBeenCalledWith('art/warden.webp', 'Bestiary/Warden.md', { showConfirmation: false });
  });

  it('names an unnamed statblock after its file, so note and card agree', async () => {
    linkService();
    const harness = noteHarness({ 'New statblock.md': '' });

    const { file } = await createStatblockNote(harness.app, { name: 'New statblock', templateId: TEMPLATE });

    expect(file.path).toBe('New statblock 2.md');
    expect(harness.files.get(file.path)).toContain('name: New statblock 2');
  });
});

describe('shownName', () => {
  it('keeps a name the user gave, and takes the file name for none or the default', () => {
    expect(shownName('Goblin', 'Bestiary/Goblin 2.md')).toBe('Goblin');
    expect(shownName('', 'New statblock 3.md')).toBe('New statblock 3');
    expect(shownName('New statblock', 'Folder/New statblock 3.md')).toBe('New statblock 3');
  });
});
