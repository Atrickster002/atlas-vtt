import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import type { CreatedTemplate } from '../../../../src/app/statblocks/editor/gallery/galleryActions';
import { gallerySources } from '../../../../src/app/statblocks/editor/gallery/gallerySources';
import { TemplateGallery } from '../../../../src/app/statblocks/editor/gallery/TemplateGallery';
import { TEMPLATE_FOLDER } from '../../../../src/app/statblocks/library/templatePaths';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { withFsPlugin, withoutFsPlugin } from './fsImportKit';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

let vault: SessionVault;
let onCreated: ReturnType<typeof vi.fn<(created: CreatedTemplate, roleId: string | null) => void>>;
let onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vault = sessionVault({ 'Bestiary/Bog.md': '---\nstatblock: true\nname: Bog\nlayout: Marsh layout\n---\n' });
  vault.frontmatter['Bestiary/Bog.md'] = { statblock: true, name: 'Bog', layout: 'Marsh layout' };
  await vault.settled();
  onCreated = vi.fn();
  onClose = vi.fn();
});

afterEach(async () => {
  cleanup();
  document.body.replaceChildren();
  withoutFsPlugin(vault.app);
  NoteFieldWriter.release(vault.app);
  await closeSessionVault(vault);
});

function open(): void {
  render(
    <TooltipProvider>
      <TemplateGallery app={vault.app} doc={document} roles={[]} systemTemplateIds={[]} onCreated={onCreated} onClose={onClose} />
    </TooltipProvider>,
  );
}

describe('From Fantasy Statblocks (§7.9)', () => {
  it('is a source only while the plugin\'s layouts can be read', () => {
    expect(gallerySources([], true).map((source) => source.label)).toEqual(['All built-ins', 'Simple', 'From a statblock', 'From Fantasy Statblocks', 'Blank']);
    expect(gallerySources([]).map((source) => source.id)).not.toContain('fantasy-statblocks');
    open();
    expect(screen.queryByRole('tab', { name: 'From Fantasy Statblocks' })).toBeNull();
  });

  it('shows each layout as a card, imports the one used, and then shows the report and the batch for its notes', async () => {
    withFsPlugin(vault.app);
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'From Fantasy Statblocks' }));
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Plain layout', 'Marsh layout', 'Footer layout']);

    fireEvent.click(screen.getByRole('radio', { name: 'Marsh layout' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use template' })); });
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const created = onCreated.mock.calls[0]![0];
    expect(created.path).toBe(`${TEMPLATE_FOLDER}/Marsh layout.atlastemplate`);
    const dialog = await screen.findByRole('dialog', { name: 'Imported Marsh layout' });
    expect(dialog.textContent).toContain('Use Marsh layout for the note using layout Marsh layout');
  });

  it('opens the template imported before when its layout is used again', async () => {
    withFsPlugin(vault.app);
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'From Fantasy Statblocks' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Footer layout' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use template' })); });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    cleanup();

    onClose.mockClear();
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'From Fantasy Statblocks' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Footer layout' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use template' })); });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
    expect(onCreated.mock.calls[1]![0].id).toBe(onCreated.mock.calls[0]![0].id);
    expect([...vault.files.keys()].filter((path) => path.startsWith(TEMPLATE_FOLDER))).toHaveLength(1);
  });
});
