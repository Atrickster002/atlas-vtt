import React, { useLayoutEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { ActionsMenuButton } from '../../../../packages/components/shared/ActionsMenuButton';
import { noteName } from '../../../../utils/pathUtils';
import { observeResize } from '../../../../utils/observeResize';
import type { CollectionContext } from '../../collectionContext';
import { CollectionChip } from '../../statblock-pane/CollectionChip';
import { PaneMenuButton } from '../../statblock-pane/PaneMenuButton';
import type { EditorSession, SessionSnapshot } from '../sessionTypes';
import { TemplateNameField } from '../TemplateNameField';
import { CAPSULE_FULL, capsuleFit, type CapsuleFit } from './capsuleFit';
import { capsuleMenuEntries, type CapsuleMenuInput } from './capsuleMenu';
import { ShowWithMenu } from './ShowWithMenu';
import type { ShowWith } from './showWith';

/** What the name keeps at least before it truncates. */
const NAME_MIN = 120;
/** The capsule's gap between its parts (`$spacing-s`). */
const GAP = 8;

type Part = 'chip' | 'name' | 'count' | 'showWith' | 'showWithIcon' | 'more';

export interface TemplateCapsuleProps {
  session: EditorSession;
  snapshot: SessionSnapshot;
  /** The statblocks that use the template, the one changed last first. */
  notes: readonly string[];
  collection: CollectionContext | null;
  onCollectionChange: (collectionId: string) => void;
  showWith: ShowWith;
  onShowWith: (choice: ShowWith) => void;
  openNote: (path: string) => void;
  /** The ⋯ menu's actions; the capsule adds what it folds into it. */
  menu: Omit<CapsuleMenuInput, 'usedBy' | 'collection'>;
}

function countText(count: number): string {
  if (count === 0) return 'template · not used yet';
  return `template · ${count} ${count === 1 ? 'statblock' : 'statblocks'}`;
}

/**
 * The template editor's header capsule (§2.3): the note view's capsule with
 * the template's name, its reach, Show with and ⋯. It never wraps, so it is
 * as tall as the note view's and the card starts at the same height: parts
 * give way in a fixed order (`capsuleFit`) and the name truncates last.
 */
export function TemplateCapsule(props: TemplateCapsuleProps): React.JSX.Element {
  const { session, snapshot, notes, collection } = props;
  const ref = useRef<HTMLDivElement>(null);
  const parts = useRef(new Map<Part, HTMLElement>());
  const widths = useRef(new Map<Part, number>());
  const [fit, setFit] = useState<CapsuleFit>(CAPSULE_FULL);
  const fixed = snapshot.readOnly || snapshot.path === null;

  useLayoutEffect(() => {
    const capsule = ref.current;
    if (!capsule) return undefined;
    const measure = (): void => {
      for (const [part, element] of parts.current) if (element.isConnected) widths.current.set(part, element.offsetWidth);
      const style = capsule.win.getComputedStyle(capsule);
      const width = (part: Part): number => widths.current.get(part) ?? 0;
      const available = capsule.clientWidth - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0);
      if (available <= 0) return;
      const next = capsuleFit({
        available, gap: GAP, chip: width('chip'), nameMin: Math.min(width('name'), NAME_MIN), count: width('count'),
        showWith: width('showWith'), showWithIcon: width('showWithIcon') || width('more'), more: width('more'),
      });
      setFit((was) => (was.showWithIcon === next.showWithIcon && was.countFolded === next.countFolded && was.chipFolded === next.chipFolded ? was : next));
    };
    measure();
    return observeResize([capsule], measure);
  });

  const part = (name: Part) => (element: HTMLElement | null): void => {
    if (element) parts.current.set(name, element);
    else parts.current.delete(name);
  };
  const rename = async (name: string): Promise<string | null> => {
    const result = await session.rename(name);
    return result.ok ? null : result.problem;
  };
  const entries = capsuleMenuEntries({
    ...props.menu,
    usedBy: fit.countFolded && !fixed ? { notes, openNote: props.openNote } : undefined,
    collection: fit.chipFolded && collection ? { context: collection, onChange: props.onCollectionChange } : undefined,
  });

  return (
    <div ref={ref} className="atlas-sb-pane-header atlas-te-capsule" role="toolbar" aria-label="Template" data-te-region="header">
      {collection && !fit.chipFolded && (
        <span ref={part('chip')} className="atlas-te-capsule__part">
          <CollectionChip context={collection} onChange={props.onCollectionChange} />
        </span>
      )}
      <span ref={part('name')} className="atlas-te-capsule__name">
        {fixed && <Lock aria-hidden="true" className="atlas-sb-pane-template__lock" />}
        <TemplateNameField name={snapshot.name} editable={!fixed} onRename={rename} />
      </span>
      {!fit.countFolded && (fixed ? (
        <span ref={part('count')} className="atlas-te-capsule__count">{snapshot.readOnlyReason === 'newer' ? 'from a newer Atlas' : 'built in'}</span>
      ) : (
        <span ref={part('count')} className="atlas-te-capsule__part">
          {notes.length === 0 ? <span className="atlas-te-capsule__count">{countText(0)}</span> : (
            <PaneMenuButton
              className="atlas-te-capsule__count"
              entries={notes.slice(0, 50).map((path) => ({ type: 'item', label: noteName(path), icon: 'scroll-text', onClick: () => props.openNote(path) }))}
            >
              {countText(notes.length)}
            </PaneMenuButton>
          )}
        </span>
      ))}
      <span ref={part(fit.showWithIcon ? 'showWithIcon' : 'showWith')} className="atlas-te-capsule__part">
        <ShowWithMenu notes={notes} value={props.showWith} onChange={props.onShowWith} compact={fit.showWithIcon} onNewStatblock={props.menu.newStatblock} />
      </span>
      <span ref={part('more')} className="atlas-sb-pane-header__end">
        <ActionsMenuButton label="More template actions" entries={entries} className="atlas-sb-pane-header__more" />
      </span>
    </div>
  );
}
