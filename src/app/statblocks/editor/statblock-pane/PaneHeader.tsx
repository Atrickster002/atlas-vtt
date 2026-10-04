import React, { forwardRef } from 'react';
import { Lock } from 'lucide-react';
import { ActionsMenuButton } from '../../../packages/components/shared/ActionsMenuButton';
import type { ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import type { CollectionContext } from '../collectionContext';
import { alignedEntries } from '../interaction/surfaceActions';
import { CollectionChip } from './CollectionChip';
import { PaneMenuButton } from './PaneMenuButton';

/** The template the header names, and what its menu offers. */
export interface HeaderTemplate {
  name: string;
  /** Named only when exactly one role of the collection uses the template. */
  roleName: string | null;
  /** Built-ins and templates of a newer Atlas are never changed themselves: a lock shows. */
  locked: boolean;
  edit?: (() => void) | undefined;
  change?: (() => void) | undefined;
  openFile?: (() => void) | undefined;
}

export interface PaneHeaderProps {
  collection: CollectionContext | null;
  onCollectionChange: (collectionId: string) => void;
  template: HeaderTemplate | null;
  showProperties?: (() => void) | undefined;
  linkToToken?: (() => void) | undefined;
  /** Hides the statblock beside its note, as the view header's action does. */
  hide?: (() => void) | undefined;
  /** A copy of the note's template that only this statblock uses (§5.5). */
  makeSeparate?: (() => void) | undefined;
}

function templateEntries(template: HeaderTemplate): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  if (template.edit) entries.push({ type: 'item', label: 'Edit template', icon: 'pencil', onClick: template.edit });
  if (template.change) entries.push({ type: 'item', label: 'Change template…', icon: 'replace', onClick: template.change });
  if (template.openFile) entries.push({ type: 'item', label: 'Open template file', icon: 'file', onClick: template.openFile });
  return entries;
}

/**
 * The pane's header (§7.2): a capsule bar with the collection chip (when more
 * than one collection could apply), the template button and the "…" menu.
 */
export const PaneHeader = forwardRef<HTMLButtonElement, PaneHeaderProps>((props, templateRef) => {
  const { template } = props;
  const more: ContextMenuEntry[] = [
    ...(template?.edit ? [{ type: 'item' as const, label: 'Edit template', icon: 'pencil', onClick: template.edit }] : []),
    ...(template?.change ? [{ type: 'item' as const, label: 'Change template…', icon: 'replace', onClick: template.change }] : []),
    ...(props.makeSeparate ? [{ type: 'item' as const, label: 'Make a separate template for this statblock…', icon: 'copy', onClick: props.makeSeparate }] : []),
    ...(props.showProperties ? [{ type: 'item' as const, label: 'Show Properties', icon: 'list', onClick: props.showProperties }] : []),
    ...(props.linkToToken ? [{ type: 'item' as const, label: 'Link to a token…', icon: 'link', onClick: props.linkToToken }] : []),
    ...(props.hide ? [{ type: 'item' as const, label: 'Hide statblock', icon: 'panel-right-close', onClick: props.hide }] : []),
  ];
  const entries = template ? templateEntries(template) : [];

  return (
    <div className="atlas-sb-pane-header" role="toolbar" aria-label="Statblock">
      {props.collection && <CollectionChip context={props.collection} onChange={props.onCollectionChange} />}
      {template && (
        <PaneMenuButton ref={templateRef} className="atlas-sb-pane-template" entries={alignedEntries(entries)} disabled={entries.length === 0}>
          {template.locked && <Lock aria-hidden="true" className="atlas-sb-pane-template__lock" />}
          {template.roleName ? `${template.roleName} · ${template.name}` : template.name}
        </PaneMenuButton>
      )}
      <span className="atlas-sb-pane-header__end">
        <ActionsMenuButton label="More statblock actions" entries={alignedEntries(more)} className="atlas-sb-pane-header__more" />
      </span>
    </div>
  );
});

PaneHeader.displayName = 'PaneHeader';
