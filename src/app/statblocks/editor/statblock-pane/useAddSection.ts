import { useCallback, useRef } from 'react';
import type { App } from 'obsidian';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { FieldRecord } from '../../values/fieldValues';
import { noteName } from '../../../utils/pathUtils';
import type { PaneServices } from '../paneServices';
import { reachOf } from './paneBlockActions';
import type { PanelHistory } from './panelHistory';
import { addSectionToTemplate } from './paneTemplateEdits';
import type { SectionChoice } from './sectionChoices';
import { copyMadeText, reachTarget } from './templateReach';
import type { PanelSessions } from './usePanelSessions';

export interface AddSectionInput {
  app: App;
  notePath: string;
  record: FieldRecord;
  collectionId: string | null;
  writer: PaneServices['writer'];
  /** The note's template as the library holds it; null while it can't change (missing, newer, loading). */
  entry: LibraryTemplate | null;
  sessions: PanelSessions;
  history: PanelHistory;
  announce: (text: string) => void;
  /** Says what happened, with Undo. */
  toast: (text: string) => void;
  /** Unfolds a section (sticky) and opens its first value once the card shows it. */
  unfold: (blockId: string) => void;
}

/**
 * "Add a section…" and a block menu's "Add a section below" (spec §8.3): a
 * folded section of the template unfolds, nothing else changes; any other
 * section is added to the note's template in one step of its session (a
 * built-in's change goes to the collection's own copy, which this note then
 * names), the menu having named the reach before the click, and a toast says
 * what happened with Undo. Focus goes to the new section's first value.
 */
export function useAddSection(input: AddSectionInput): (choice: SectionChoice, after: string | null) => Promise<void> {
  const latest = useRef(input);
  latest.current = input;
  return useCallback(async (choice: SectionChoice, after: string | null): Promise<void> => {
    const now = latest.current;
    if (choice.kind === 'unfold') {
      now.unfold(choice.blockId);
      return;
    }
    const entry = now.entry;
    if (!entry) {
      now.announce('This statblock\'s template can\'t change right now.');
      return;
    }
    const reach = reachOf(now.app, entry, now.collectionId);
    const result = await addSectionToTemplate({
      app: now.app, notePath: now.notePath, record: now.record, collectionId: now.collectionId, writer: now.writer,
      templateId: entry.template.id, builtIn: entry.builtIn, hold: now.sessions.hold, drop: now.sessions.drop,
    }, choice.section, after);
    if (!result.ok) {
      now.announce(result.problem);
      return;
    }
    now.history.templateChanged(result.step);
    now.unfold(result.blockId);
    const label = choice.section.label;
    const said = result.copied?.made
      ? `${copyMadeText(entry.name, noteName(now.notePath))} Added ${label} to it.`
      : `Added ${label} to ${reachTarget(reach)}.`;
    now.announce(said);
    now.toast(said);
  }, []);
}
