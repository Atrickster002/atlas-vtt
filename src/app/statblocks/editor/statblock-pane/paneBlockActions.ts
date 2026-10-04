/**
 * What a block's menu does in the panel (spec §5.5, §9.1): edit its value,
 * copy it, clear this note's values of it (one write to the note), open the
 * template editor on it, and remove it from the note's template (one step in
 * the template's session, or in the collection's copy of a built-in), with
 * the reach named before the click.
 */

import type { App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { ownCopyOf } from '../../library/ownCopy';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import { templateNotes } from '../../library/templateUsage';
import { coreSlotOf } from '../../model/coreSlots';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import { findBlock } from '../../model/treeQueries';
import type { StatblockTemplate } from '../../model/templateTypes';
import { noteName } from '../../../utils/pathUtils';
import type { PaneServices } from '../paneServices';
import { blockName } from '../template-editor/blockNames';
import type { PanelSessions } from './usePanelSessions';
import { rollsIn } from './diceRolls';
import type { BlockMenuInput } from './paneMenus';
import type { PaneEditController } from './paneEditContext';
import { clearPatches, removeBlockFromTemplate } from './paneTemplateEdits';
import type { TemplateBlockTarget } from './paneTypes';
import { copyMadeText, removedLiveText, removedToastText, removeRowText, templateReachOf, type TemplateReach } from './templateReach';

export interface BlockActionInput {
  app: App;
  pane: PaneEditController;
  template: StatblockTemplate;
  blockId: string;
  /** The block's drawn element, whose text "Copy as text" takes. */
  element: HTMLElement;
  /** The note's template as the library holds it; null while it cannot change (missing, newer, loading). */
  entry: LibraryTemplate | null;
  onValue: boolean;
  writer: PaneServices['writer'];
  sessions: PanelSessions;
  openTemplateAt?: ((target: TemplateBlockTarget) => void) | undefined;
  copy: (text: string) => void;
  /** Says what happened, with Undo. */
  toast: (text: string) => void;
}

/** How far a change of the note's template reaches now: read when the menu opens, from the metadata cache. */
export function reachOf(app: App, entry: LibraryTemplate, collectionId: string | null): TemplateReach {
  const id = entry.template.id;
  const usage = Math.max(1, templateNotes(app, id).length);
  const settings = collectionId ? AssetService.getInstance(app).getCollectionSettings(collectionId) : null;
  const copy = entry.builtIn ? ownCopyOf(settings, TemplateLibrary.forApp(app), id) : null;
  return templateReachOf({
    builtIn: entry.builtIn,
    name: entry.name,
    usage,
    copy: copy ? { id: copy.template.id, usage: templateNotes(app, copy.template.id).length } : null,
  });
}

export function blockMenuInput(input: BlockActionInput): BlockMenuInput | null {
  const { app, pane, template, blockId, entry } = input;
  const block = findBlock(template.layout.blocks, blockId)?.block;
  if (!block) return null;
  const name = blockName(block, template.fields);
  const fields = pane.spots.byBlock.get(blockId) ?? [];
  const patches = clearPatches(template, block, pane.record);
  const editable = pane.writable && entry !== null && entry.status === 'ok';
  const reach = editable ? reachOf(app, entry, pane.collectionId) : null;

  const remove = async (): Promise<void> => {
    if (!entry || !reach) return;
    const result = await removeBlockFromTemplate({
      app, notePath: pane.notePath, record: pane.record, collectionId: pane.collectionId, writer: input.writer,
      templateId: entry.template.id, builtIn: entry.builtIn, hold: input.sessions.hold, drop: input.sessions.drop,
    }, blockId);
    if (!result.ok) {
      pane.announce(result.problem);
      return;
    }
    pane.history.templateChanged(result.step);
    pane.announce(removedLiveText(reach, name));
    input.toast(result.copied?.made ? copyMadeText(entry.name, noteName(pane.notePath)) : removedToastText(reach, name));
  };

  return {
    name,
    editable: fields.length > 0 && pane.writable,
    hasValues: patches.length > 0,
    onValue: input.onValue,
    edit: () => {
      const first = fields[0];
      if (first) pane.start({ blockId, field: first.key });
    },
    copyText: () => input.copy(input.element.innerText.trim()),
    clear: () => {
      const named = (key: unknown, each: { key: string; formerKeys?: readonly string[] | undefined }): boolean => key === each.key || each.formerKeys?.includes(String(key)) === true;
      const field = template.fields.find((each) => patches.some((patch) => 'path' in patch && named(patch.path[0], each)));
      if (!field || !patches.length) return;
      void pane.write(field, patches);
      // A section whose values are cleared folds into its chip again (§8.2).
      pane.setUnfolded(blockId, false);
      pane.announce(`Cleared ${name} on ${noteName(pane.notePath)}.`);
      input.toast(`Cleared ${name} on ${noteName(pane.notePath)}.`);
    },
    editInTemplate: input.openTemplateAt && entry
      ? () => input.openTemplateAt?.({ templateId: entry.template.id, path: entry.path, blockId, collectionId: pane.collectionId, notePath: pane.notePath })
      : undefined,
    // The Name and the token picture stay in every template (`coreSlots`).
    remove: reach && !coreSlotOf(template.layout, blockId) ? { label: removeRowText(reach, name), run: () => void remove() } : undefined,
    addSectionBelow: editable ? () => pane.openAddSection({ after: blockId }) : undefined,
    rolls: rollsIn(input.element),
  };
}
