import React, { useMemo } from 'react';
import type { App } from 'obsidian';
import { Button } from '../../../../packages/components/primitives/button';
import { AssetService } from '../../../../services/AssetService';
import { noteName } from '../../../../utils/pathUtils';
import { builtInTemplate } from '../../../library/builtInTemplates';
import { ownCopyOf } from '../../../library/ownCopy';
import { TemplateLibrary } from '../../../library/TemplateLibrary';
import { templateNotes } from '../../../library/templateUsage';
import type { SessionSnapshot } from '../sessionTypes';
import { builtInLine } from './builtInLine';
import { SwitchStatblocksChip } from './SwitchStatblocksChip';

/** The line under the card while nothing else needs it (§12.1). */
export const GESTURE_HINT = 'Point at a part to change it · / adds · right-click for more';

export interface TemplateFooterLineProps {
  app: App | undefined;
  snapshot: SessionSnapshot;
  collectionId: string | null;
  /** The note "Edit template" came from. */
  fromNote: string | null;
  /** "Shown as a hover card" while the card is not at the note's width; null at the note's. */
  showAsLine: string | null;
  onBackToNote: () => void;
}

/** The collection's own copy of a built-in, as the footer speaks of it. */
function copyFacts(app: App, collectionId: string | null, builtInId: string): { id: string; name: string; usage: number } | null {
  if (!collectionId) return null;
  const copy = ownCopyOf(AssetService.getInstance(app).getCollectionSettings(collectionId), TemplateLibrary.forApp(app), builtInId);
  return copy ? { id: copy.template.id, name: copy.name, usage: templateNotes(app, copy.template.id).length } : null;
}

/**
 * The template editor's line under the card (§2.4), one at a time: where a
 * built-in's changes go, or, on the collection's own copy of one, the
 * statblocks still on the built-in; the width the card is shown at; else the
 * gesture hint. It sits in the footer slot, so nothing in it moves the card.
 */
export function TemplateFooterLine({ app, snapshot, collectionId, fromNote, showAsLine, onBackToNote }: TemplateFooterLineProps): React.JSX.Element {
  const cow = snapshot.copyOnWrite;
  const derived = snapshot.template.derivedFrom?.templateId;
  const facts = useMemo(() => {
    if (cow) {
      const copy = app ? copyFacts(app, collectionId, cow.builtInId) : null;
      return { line: builtInLine({ builtInName: cow.builtInName, copy, fromNote: fromNote ? noteName(fromNote) : null }) };
    }
    if (!app) return null;
    // The collection's own copy (§9.1): the statblocks still on the built-in may switch to it.
    const copy = derived ? copyFacts(app, collectionId, derived) : null;
    if (!derived || copy?.id !== snapshot.id) return null;
    const waiting = templateNotes(app, derived);
    return waiting.length ? { switching: { from: derived, name: builtInTemplate(derived)?.name ?? 'the built-in', notes: waiting } } : null;
  }, [app, cow, derived, collectionId, fromNote, snapshot.id]);

  const line = ((): React.ReactNode => {
    if (snapshot.readOnlyReason === 'newer') return <span>This template is from a newer Atlas. Update Atlas to edit it.</span>;
    if (facts && 'line' in facts) return <span>{facts.line}</span>;
    if (showAsLine) {
      return (
        <>
          <span>{showAsLine}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onBackToNote}>Back to note</Button>
        </>
      );
    }
    if (facts && 'switching' in facts && facts.switching && app) {
      return <SwitchStatblocksChip app={app} from={facts.switching.from} to={snapshot.id} builtInName={facts.switching.name} notes={facts.switching.notes} />;
    }
    return <span>{GESTURE_HINT}</span>;
  })();
  return <div className="atlas-te-footer-line">{line}</div>;
}
