import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import { registerCommands, type CommandDependencies } from '../../../../src/app/plugin/registerCommands';
import { AssetService } from '../../../../src/app/services/AssetService';
import { openTemplateEditor } from '../../../../src/app/statblocks/editor/openTemplateEditor';
import { openCreatedTemplate, saveStatblockAsTemplate } from '../../../../src/app/statblocks/editor/gallery/galleryActions';
import { openTemplateGallery } from '../../../../src/app/statblocks/editor/gallery/openTemplateGallery';
import { registerHostedDialogRelease } from '../../../../src/app/statblocks/editor/hostedDialog';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { TEMPLATE_FOLDER } from '../library/templateTexts';

vi.mock('../../../../src/app/statblocks/editor/openTemplateEditor', () => ({ openTemplateEditor: vi.fn(async () => null) }));

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
let vault: SessionVault;
let settings: CollectionSettings;
let updateCollectionSettings: ReturnType<typeof vi.fn>;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vault = sessionVault();
  settings = { conditions: [], systemPresetId: dnd5e.id };
  updateCollectionSettings = vi.fn(async () => undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollections: async () => [{ id: 'marsh', name: 'Marsh' }],
    loadedCollections: () => [],
    getDefaultCollectionId: () => 'marsh',
    getCollectionSettings: () => settings,
    updateCollectionSettings,
  } as unknown as AssetService);
  await vault.settled();
  vi.mocked(openTemplateEditor).mockClear();
});

afterEach(async () => {
  cleanup();
  await closeSessionVault(vault);
  vi.restoreAllMocks();
});

const created = { id: 'creature-abc123', path: `${TEMPLATE_FOLDER}/Creature.atlastemplate` };

describe('after the gallery', () => {
  it('opens the new template in the editor with nothing selected, asking nothing about other statblocks', async () => {
    await openCreatedTemplate(vault.app, created, 'marsh', null);
    expect(updateCollectionSettings).not.toHaveBeenCalled();
    expect(openTemplateEditor).toHaveBeenCalledWith(vault.app, { templateId: created.id, path: created.path, collectionId: 'marsh' });
  });

  it('gives the template to the role first, storing the collection\'s own roles', async () => {
    await openCreatedTemplate(vault.app, created, 'marsh', 'npc');
    expect(updateCollectionSettings).toHaveBeenCalledWith('marsh', {
      statblockRoles: [
        { id: 'monster', name: 'Monster', templateId: 'builtin:5e-2024-monster' },
        { id: 'npc', name: 'NPC', templateId: created.id },
      ],
    });
  });

  it('stores no roles of its own where the role ends at the system\'s template again', async () => {
    await openCreatedTemplate(vault.app, { ...created, id: 'builtin:5e-2024-monster' }, 'marsh', 'npc');
    expect(updateCollectionSettings).toHaveBeenCalledWith('marsh', { statblockRoles: undefined });
  });
});

describe('Save as a template', () => {
  it('builds a template from the statblock\'s values and opens it previewing the statblock', async () => {
    await saveStatblockAsTemplate(vault.app, 'Bestiary/Bog Hag.md', { statblock: true, name: 'Bog Hag', hp: 30, speed: '30 ft.' }, 'marsh');
    const path = `${TEMPLATE_FOLDER}/Bog Hag.atlastemplate`;
    const template = JSON.parse(vault.files.get(path)!) as StatblockTemplate;
    expect(template.fields.map((field) => field.key)).toEqual(['name', 'hp', 'speed']);
    expect(openTemplateEditor).toHaveBeenCalledWith(vault.app, {
      templateId: template.id, path, previewPath: 'Bestiary/Bog Hag.md', collectionId: 'marsh', select: template.layout.blocks[0]!.id,
    });
  });

  it('writes nothing for a statblock without values', async () => {
    await saveStatblockAsTemplate(vault.app, 'Bestiary/Empty.md', { statblock: true }, 'marsh');
    expect([...vault.files.keys()].some((path) => path.endsWith('Empty.atlastemplate'))).toBe(false);
    expect(openTemplateEditor).not.toHaveBeenCalled();
  });
});

describe('New statblock template…', () => {
  type Command = { id: string; checkCallback?: (checking: boolean) => boolean | void };

  function commands(): Command[] {
    const added: Command[] = [];
    const addCommand = (command: Command): Command => { added.push(command); return command; };
    // Everything else a plugin offers (ribbon icons, events) does nothing here.
    const plugin = new Proxy({ app: vault.app, addCommand }, { get: (target, name) => (name in target ? target[name as keyof typeof target] : vi.fn()) });
    registerCommands(plugin as unknown as Plugin, {} as CommandDependencies);
    return added;
  }

  it('is offered only while the statblock editor is switched on', () => {
    const command = commands().find((entry) => entry.id === 'new-statblock-template')!;
    expect(command.checkCallback?.(true)).toBe(false);
    withStatblockEditor(vault.app);
    expect(command.checkCallback?.(true)).toBe(true);
  });

  it('opens the gallery for the default collection, with its system\'s templates', async () => {
    withStatblockEditor(vault.app);
    await act(async () => { await openTemplateGallery(vault.app); });
    expect(screen.getByRole('dialog', { name: 'New template' })).toBeTruthy();
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['5E (2024 rules)']);
    expect(screen.getByRole('combobox', { name: 'Starts new statblocks for' }).textContent).toBe('Monster');
    act(() => { screen.getByRole('button', { name: 'Cancel' }).click(); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New template' })).toBeNull());
    expect(document.querySelector('.atlas-te-gallery-host')).toBeNull();
  });

  it('goes with its window when that closes, and with Atlas when it unloads', async () => {
    withStatblockEditor(vault.app);
    const unloads: Array<() => void> = [];
    const plugin = { app: vault.app, registerEvent: vi.fn(), register: (unload: () => void) => unloads.push(unload) };
    registerHostedDialogRelease(plugin as unknown as Plugin);
    const gallery = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'New template' });

    await act(async () => { await openTemplateGallery(vault.app); });
    act(() => vault.workspace.trigger('window-close', {}, { document: document.implementation.createHTMLDocument('Popout') }));
    expect(gallery()).toBeTruthy();
    act(() => vault.workspace.trigger('window-close', {}, window));
    expect(gallery()).toBeNull();
    expect(document.querySelector('.atlas-te-gallery-host')).toBeNull();

    await act(async () => { await openTemplateGallery(vault.app); });
    expect(gallery()).toBeTruthy();
    act(() => { for (const unload of unloads) unload(); });
    expect(gallery()).toBeNull();
    expect(document.querySelector('.atlas-te-gallery-host')).toBeNull();
  });

  it('does nothing while the statblock editor is switched off', async () => {
    await openTemplateGallery(vault.app);
    expect(screen.queryByRole('dialog', { name: 'New template' })).toBeNull();
  });
});
