import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { SettingsService } from '../../../services/SettingsService';
import { StatblockSkeleton } from '../../../react/components/statblock/StatblockSkeleton';
import { useTemplateLibrary } from '../../library/useTemplateLibrary';
import type { TemplateId } from '../../model/templateTypes';
import { flattenReadingOrder } from '../../model/treeQueries';
import { setStatblockPaneSettings, statblockPaneSettings } from '../paneSettings';
import { makeSeparateTemplate } from './separateTemplate';
import { templateKeyPatch } from './templateKeyPatch';
import { AddSectionMenu } from './AddSectionMenu';
import { ChangeTemplateDialog } from './ChangeTemplateDialog';
import { PanelFrame } from '../panel-frame/PanelFrame';
import { MorePropertiesTray } from './MorePropertiesTray';
import { PaneCanvas } from './PaneCanvas';
import { PaneDiceRolls } from './PaneDiceRolls';
import { PaneHandles } from './PaneHandles';
import { PaneHeader } from './PaneHeader';
import { headerTemplate } from './paneHeaderTemplate';
import { NewerTemplateBar, NoteDeletedBar, NotNativeState, TemplateMissingBar, UnreadableState, WriteProblemBar } from './PaneStates';
import type { StatblockPaneProps } from './paneTypes';
import { usePaneCollection } from './usePaneCollection';
import { usePaneNote } from './usePaneNote';
import { usePaneTemplate } from './usePaneTemplate';
import './statblock-pane.scss';

/**
 * The statblock pane (§7.2), drawn beside its note in the same view: a
 * header, then the note's statblock as the runtime card with its values
 * editable in place, the first-visit hint and the tray of the note's other
 * properties; or the state the plan's edge-state table names.
 */
export function StatblockPane(props: StatblockPaneProps): React.JSX.Element {
  const { app, services, notePath, actions } = props;
  const note = usePaneNote(app, services, notePath);
  const collection = usePaneCollection(app, notePath, props.collectionId, actions.changeCollection);
  const paneTemplate = usePaneTemplate(app, note.templateId, note.record);
  const library = useTemplateLibrary(app);
  const settings = useAtlasSettings(SettingsService.forApp(app));
  const [choosing, setChoosing] = useState(false);
  const [writeProblem, setWriteProblem] = useState<string | null>(null);
  // The view's announcements (undo, redo) and the pane's own (a deleted entry), the latest one said.
  const [said, setSaid] = useState(props.announcement);
  useEffect(() => setSaid(props.announcement), [props.announcement]);
  const rootRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<HTMLButtonElement>(null);
  const trayRef = useRef<HTMLButtonElement>(null);
  const handledFocusRequest = useRef(0);
  const collectionId = collection.context?.collectionId ?? props.collectionId;

  useEffect(() => setWriteProblem(null), [notePath]);

  // "Make a separate template for this statblock…" (§5.5): the one explicit way to a copy for one statblock.
  const makeSeparate = useCallback((): void => {
    const templateId = note.templateId;
    if (!templateId) return;
    void makeSeparateTemplate(app, services.writer, notePath, note.record, templateId).then(setSaid);
  }, [app, services.writer, notePath, note.record, note.templateId]);

  const applyTemplate = useCallback((templateId: TemplateId): void => {
    setChoosing(false);
    void services.writer.write(notePath, [templateKeyPatch(note.record, templateId)]).then((outcome) => {
      setWriteProblem(outcome.conflicts.length ? 'the note\'s template changed meanwhile.' : outcome.problem);
    });
  }, [services, notePath, note.record]);

  const onExit = useCallback((step: 1 | -1): void => {
    (step === 1 ? trayRef.current : templateRef.current)?.focus();
  }, []);
  const onCommitted = useCallback((): void => {
    if (settings && !statblockPaneSettings(settings).hintDismissed) setStatblockPaneSettings(settings, { hintDismissed: true });
  }, [settings]);

  const writable = note.kind === 'atlas' && paneTemplate.status !== 'loading';
  const entry = writable && paneTemplate.status === 'ok' ? paneTemplate.entry : null;
  const hasSocket = writable && paneTemplate.status === 'ok'
    && flattenReadingOrder(paneTemplate.template.layout.blocks).some((block) => block.type === 'image');
  // "Link to a token…" opens the card's token socket; a template without one keeps the token picker.
  const linkToToken = (): void => {
    const socket = rootRef.current?.querySelector<HTMLButtonElement>('.atlas-sb-token-socket');
    if (socket) {
      // After the menu has closed and handed focus back to its trigger.
      socket.win.requestAnimationFrame(() => {
        socket.scrollIntoView({ block: 'nearest' });
        socket.click();
      });
    } else if (actions.linkToToken && collectionId) {
      actions.linkToToken(notePath, collectionId);
    }
  };
  const header = headerTemplate({
    note, paneTemplate, roles: collection.roles, collectionId, actions, app,
    choose: () => setChoosing(true),
  });

  const body = ((): React.ReactNode => {
    switch (note.kind) {
      case 'loading': return <StatblockSkeleton className="atlas-sb-pane-card" />;
      case 'unreadable': return <UnreadableState line={note.snapshot.problem?.line ?? null} />;
      case 'fantasy': case 'none': return <NotNativeState />;
      case 'atlas': case 'deleted': break;
    }
    if (paneTemplate.status === 'loading') return <StatblockSkeleton className="atlas-sb-pane-card" />;
    const bars = (
      <>
        {note.kind === 'deleted' && <NoteDeletedBar />}
        {paneTemplate.status === 'missing' && note.templateId && <TemplateMissingBar templateId={note.templateId} onChoose={() => setChoosing(true)} />}
        {paneTemplate.status === 'newer' && <NewerTemplateBar />}
        {writeProblem && <WriteProblemBar problem={writeProblem} />}
      </>
    );
    const hint = writable && settings && !statblockPaneSettings(settings).hintDismissed;
    return (
      <>
        {hint && <p className="atlas-sb-pane-hint-line">Click a value to fill it in. Point at a part for its options.</p>}
        {bars}
        <PaneCanvas
          // One editing session per note: what was typed for a note is written to that note, never the next one.
          key={notePath}
          app={app}
          services={services}
          notePath={notePath}
          collectionId={collectionId}
          template={paneTemplate.template}
          entry={entry}
          templateName={paneTemplate.name}
          record={note.record}
          writable={writable}
          pendingCommit={props.pendingCommit}
          footer={entry && <AddSectionMenu />}
          focusRequest={props.focusRequest}
          handledFocusRequest={handledFocusRequest}
          onExit={onExit}
          onCommitted={onCommitted}
          onWriteProblem={setWriteProblem}
          announce={setSaid}
        >
          {writable && (
            <MorePropertiesTray
              ref={trayRef}
              record={note.record}
              template={paneTemplate.template}
              addToCard={Boolean(entry)}
            />
          )}
          <PaneHandles
            paneRef={rootRef}
            template={paneTemplate.template}
            entry={paneTemplate.status === 'ok' ? paneTemplate.entry : null}
            services={services}
            actions={actions}
          />
        </PaneCanvas>
      </>
    );
  })();

  return (
    <PanelFrame
      ref={rootRef}
      wrap={(content) => <PaneDiceRolls app={app} collectionId={collectionId}>{content}</PaneDiceRolls>}
      header={(
        <PaneHeader
          ref={templateRef}
          collection={collection.context}
          onCollectionChange={actions.changeCollection}
          template={header}
          showProperties={note.kind === 'atlas' && !props.propertiesShown ? actions.showProperties : undefined}
          linkToToken={note.kind === 'atlas' && (hasSocket || (actions.linkToToken && collectionId)) ? linkToToken : undefined}
          makeSeparate={entry ? makeSeparate : undefined}
          hide={actions.hide}
        />
      )}
      after={(
        <>
          <div className="atlas-sb-pane-live" role="status" aria-live="polite">{said}</div>
          {choosing && note.kind === 'atlas' && rootRef.current && library && (
            <ChangeTemplateDialog
              app={app}
              anchor={rootRef.current}
              notePath={notePath}
              record={note.record}
              currentId={note.templateId}
              templates={library.templates}
              roles={collection.roles}
              onApply={applyTemplate}
              onClose={() => setChoosing(false)}
            />
          )}
        </>
      )}
    >
      {body}
    </PanelFrame>
  );
}
