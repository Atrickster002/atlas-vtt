import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { useTemplateLibrary } from '../../library/useTemplateLibrary';
import { deleteTemplate } from '../../library/templateActions';
import { noteName } from '../../../utils/pathUtils';
import { TemplateDragAndDrop } from '../dnd/DndProvider';
import { foldedBlocks } from '../../render/foldRule';
import { FoldedChips } from '../panel-frame/FoldedChips';
import { BlankCard } from './BlankCard';
import { insertNamedStat } from './blockActions';
import { Canvas } from './Canvas';
import { DeleteTemplateDialog } from './DeleteTemplateDialog';
import { dockMenuEntries } from './dock/dockPanels';
import { EditorFloats } from './dock/EditorFloats';
import { useFloatingPanels } from './dock/useFloatingPanels';
import { TemplateEditorContext, type TemplateEditorContextValue } from './editorContext';
import { EditorOverlays } from './EditorOverlays';
import { primaryOf, type BlockSelection } from './selection';
import type { EditorSession } from './sessionTypes';
import { handleShellKey } from './shell/shellKeys';
import type { ShowWith, ShowWithMode } from './shell/showWith';
import { TemplateFooterLine } from './shell/TemplateFooterLine';
import { TemplateCapsule } from './shell/TemplateCapsule';
import { TemplateNoteRow } from './shell/TemplateNoteRow';
import { TemplateStateBars } from './shell/TemplateStateBars';
import { usePanelRoom } from './shell/usePanelRoom';
import { useShowAs } from './shell/useShowAs';
import { useShowWith } from './shell/useShowWith';
import { useCollectionFieldKeys } from './useCollectionFieldKeys';
import { useEditorCollection } from './useEditorCollection';
import { useSessionSnapshot } from './useEditorSession';
import { useEditorState } from './useEditorState';
import { usePreviewRecord } from './usePreviewRecord';
import { useTemplateKeyboard, type KeyboardTarget, type KeyHandler } from './useTemplateKeyboard';
import { useTemplateUsage } from './useTemplateUsage';
import { duplicateTemplate, newStatblockFromTemplate, type TemplateTarget } from './templateEditorActions';
import './template-editor.scss';

/** What the editor asks of the view that hosts it. */
export interface TemplateEditorHost {
  /** Opens a template: in this tab or in a new one. */
  openTemplate: (target: TemplateTarget, where: 'here' | 'tab') => void;
  openNote: (path: string) => void;
  /** Back to the note this leaf showed before "Edit template" (§8.4). */
  backToNote?: (() => void) | undefined;
  /** The template was deleted from here. */
  close: () => void;
}

export interface TemplateEditorProps {
  app?: App | undefined;
  session: EditorSession;
  host: TemplateEditorHost;
  /** The statblock the editor shows its template with ("Edit template" from a statblock, or chosen). */
  previewPath: string | null;
  /** Sample or Empty as chosen; null while nothing was chosen. */
  previewMode?: ShowWithMode | null | undefined;
  onShowWithChange: (choice: ShowWith) => void;
  collectionId: string | null;
  onCollectionChange: (collectionId: string) => void;
  initialSelection?: BlockSelection | undefined;
  /** The note this leaf showed before "Edit template" (§8.4); null when it opened on its own. */
  fromNote?: string | null | undefined;
  /** The view's key scope asks this handler first (§7.7). */
  registerKeys?: ((handler: KeyHandler | null) => void) | undefined;
}

/** Shares copied blocks where no app does (a test without Obsidian). */
const LOCAL_CLIPS = {};

/**
 * The template editor (§2): the note view with its statblock, the note on the
 * left and the card on the right at the width the user's notes give it, with
 * the dock and the floating panels over the note column. Everything it
 * changes goes through the session, one undo step per action.
 */
export function TemplateEditor(props: TemplateEditorProps): React.JSX.Element {
  const { app, session, host, registerKeys } = props;
  const snapshot = useSessionSnapshot(session);
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const collection = useEditorCollection(app, props.collectionId);
  const collectionId = collection?.collectionId ?? props.collectionId;
  const collectionKeys = useCollectionFieldKeys(app, collectionId);
  const usage = useTemplateUsage(app, snapshot.id);
  const shown = useShowWith(app, usage.notes, props.previewPath, props.previewMode ?? null);
  const preview = usePreviewRecord(app, snapshot.template, shown.showWith);
  const library = useTemplateLibrary(app ?? null);
  const room = usePanelRoom(app, rowRef, previewRef);
  const showAs = useShowAs(rootRef);
  const floats = useFloatingPanels(app, room.editorWidth, room.noteColumn);
  const state = useEditorState({ session, snapshot, collectionKeys, stageRef, layer, initialSelection: props.initialSelection });
  // Sections unfolded here stay open while the editor lives; the rest fold as in the note view (§8.2, J6).
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set());
  const folded = useMemo(() => foldedBlocks(snapshot.template, preview.record, unfolded), [snapshot.template, preview.record, unfolded]);
  const foldedKey = folded.map((block) => block.blockId).join(' ');
  const foldedSet = useMemo(() => new Set(foldedKey ? foldedKey.split(' ') : []), [foldedKey]);
  const unfold = (blockId: string): void => {
    setUnfolded((now) => new Set([...now, blockId]));
    state.select([blockId], true);
  };

  const target: KeyboardTarget = {
    rootRef, session, selection: state.selection, drawn: state.drawn, select: state.select, settle: state.settle,
    editLabel: state.editLabel, openInsert: () => state.openInsert(), openMenu: () => setMenuOpen(true), clipOwner: app ?? LOCAL_CLIPS,
  };
  const onKey = useTemplateKeyboard(target);
  useEffect(() => {
    registerKeys?.(onKey);
    return () => registerKeys?.(null);
  }, [registerKeys, onKey]);

  const context: TemplateEditorContextValue = {
    app, session, snapshot, selection: state.selection, select: state.select,
    insert: (item) => {
      state.insert(item);
      floats.inserted();
    },
    insertNamedStat: (name) => {
      state.settle(insertNamedStat(session, name, { after: primaryOf(state.selection) }));
      floats.inserted();
    },
    editLabel: state.editLabel, announce: state.announce, collectionId, collectionKeys, openSettings: floats.openSettings,
  };
  const newStatblock = app ? (): void => { void newStatblockFromTemplate(app, snapshot.id, collectionId); } : undefined;
  const makeCopy = app && !copying ? (): void => {
    setCopying(true);
    void duplicateTemplate(app, snapshot.id).then((made) => {
      setCopying(false);
      if (made) host.openTemplate(made, 'tab');
    });
  } : undefined;
  const fromNote = props.fromNote ?? null;

  return (
    <TemplateEditorContext.Provider value={context}>
      <div
        ref={(element) => { rootRef.current = element; setRoot(element); }}
        className="atlas-te"
        data-width={room.editorWidth}
        onKeyDown={(event) => {
          if (!handleShellKey(event.nativeEvent, floats) && !onKey(event.nativeEvent)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <TemplateDragAndDrop
          rootRef={rootRef}
          stageRef={stageRef}
          session={session}
          readOnly={snapshot.readOnly}
          record={preview.record}
          app={app}
          sourcePath={preview.sourcePath}
          settle={state.settle}
          select={state.select}
          announce={state.announce}
        >
          <TemplateNoteRow
            ref={rowRef}
            app={app}
            room={room}
            showWith={shown.showWith}
            previewRef={previewRef}
            openNote={host.openNote}
            capsule={(
              <TemplateCapsule
                session={session}
                snapshot={snapshot}
                notes={shown.notes}
                collection={collection}
                onCollectionChange={props.onCollectionChange}
                showWith={shown.showWith}
                onShowWith={props.onShowWithChange}
                openNote={host.openNote}
                menu={{
                  showAs: showAs.choice,
                  showAsChoices: showAs.choices,
                  onShowAs: showAs.setChoice,
                  newStatblock,
                  makeCopy,
                  backToNote: fromNote && host.backToNote ? { name: noteName(fromNote), go: host.backToNote } : undefined,
                  deleteTemplate: snapshot.path !== null && app ? () => setDeleting(true) : undefined,
                  dock: room.editorWidth === 'stacked' ? dockMenuEntries(floats.openDock) : undefined,
                }}
              />
            )}
            stateBars={(
              <TemplateStateBars session={session} snapshot={snapshot} />
            )}
            card={(
              <Canvas
                stageRef={stageRef}
                app={app}
                template={snapshot.template}
                templateName={snapshot.name}
                record={preview.record}
                sourcePath={preview.sourcePath}
                selection={state.selection}
                editable={!snapshot.readOnly}
                label={state.editing}
                washId={state.washId}
                onWashed={state.clearWash}
                onSelect={(selection) => state.select(selection, false)}
                onEditLabel={state.editLabel}
                onInsertAt={state.openInsertAtGap}
                focusRequest={state.focusRequest}
                empty={(
                  <BlankCard onInsert={snapshot.readOnly ? undefined : (item) => context.insert(item)} />
                )}
                shownWidth={showAs.width}
                folded={foldedSet}
              />
            )}
            footer={(
              <>
                <FoldedChips folded={folded} onUnfold={unfold} />
                <TemplateFooterLine
                app={app}
                snapshot={snapshot}
                collectionId={collectionId}
                fromNote={fromNote}
                showAsLine={showAs.line}
                onBackToNote={() => showAs.setChoice('note')}
                />
              </>
            )}
          />
          <EditorFloats
            root={root}
            stage={stageRef.current}
            session={session}
            snapshot={snapshot}
            selection={state.selection}
            floats={floats}
            width={room.editorWidth}
            noteColumn={room.noteColumn}
          />
          <div ref={setLayer} className="atlas-te-layer" />
          <EditorOverlays
            app={app}
            layer={layer}
            stage={stageRef.current}
            snapshot={snapshot}
            state={state}
            target={target}
            menuOpen={menuOpen}
            onMenuOpenChange={setMenuOpen}
            onSettings={floats.openSettings}
          />
        </TemplateDragAndDrop>
        {deleting && rootRef.current && app && (
          <DeleteTemplateDialog
            anchor={rootRef.current}
            name={snapshot.name}
            templateId={snapshot.id}
            usage={usage}
            templates={library?.templates ?? []}
            onDelete={async (replacement) => {
              await deleteTemplate(app, snapshot.id, replacement);
              setDeleting(false);
              host.close();
            }}
            onClose={() => setDeleting(false)}
          />
        )}
      </div>
    </TemplateEditorContext.Provider>
  );
}
