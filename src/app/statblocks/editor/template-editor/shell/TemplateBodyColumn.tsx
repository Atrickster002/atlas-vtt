import React, { useEffect, useRef } from 'react';
import { Component, MarkdownRenderer, type App } from 'obsidian';
import { cn } from '../../../../../utils/cn';
import { runInBackground } from '../../../../utils/backgroundTask';
import { startTemplateBody } from '../../../library/templateBodyNotes';
import { useTemplateEditor } from '../editorContext';
import type { SessionSnapshot } from '../sessionTypes';
import { readableLineOn } from './obsidianConfig';
import { useHostedNote, useTemplateBodyFile } from './useTemplateBodyNote';
import './template-body.scss';

export const BODY_PLACEHOLDER = 'Write what every new statblock of this template starts with…';
/** The empty note's placeholder, which the stylesheet draws: a CSS string. */
const PLACEHOLDER_STYLE = { '--atlas-te-note-placeholder': JSON.stringify(BODY_PLACEHOLDER) } as React.CSSProperties;
/** Marks the hosted note: every key pressed in it is the note's. */
export const HOSTED_NOTE_ATTRIBUTE = 'data-te-hosted-note';

export interface TemplateBodyColumnProps {
  app: App | undefined;
  /** The column's text box, whose readable line the panel's default width follows. */
  previewRef: React.RefObject<HTMLDivElement | null>;
  /** What stands over the note while it is open (the template as JSON); the note keeps its place under it. */
  cover?: React.ReactNode;
}

/** A template with no file has no note yet: saving it gives it one. */
function unsavedLine(snapshot: SessionSnapshot): string {
  return snapshot.builtIn
    ? 'Save this template as your own to write the text its statblocks start with.'
    : 'Save the template to write the text its statblocks start with.';
}

/**
 * The note column of the template editor (§2.2): the note beside the template
 * file, whose text every new statblock of the template starts with, in
 * Obsidian's own editor with the note view's width and margins, so the card
 * stands where a note view's does. It saves as it is typed, like any note.
 * A template without its note offers to start one; a built-in or a template
 * never saved has none until it is saved.
 */
export function TemplateBodyColumn({ app, previewRef, cover }: TemplateBodyColumnProps): React.JSX.Element {
  const { snapshot } = useTemplateEditor();
  const file = useTemplateBodyFile(app, snapshot.id, snapshot.path);
  const hostRef = useRef<HTMLDivElement>(null);
  const focusOnShow = useRef(false);
  useHostedNote(app, file, hostRef, focusOnShow);
  const templatePath = snapshot.path;

  const start = (): void => {
    if (!app || templatePath === null) return;
    focusOnShow.current = true;
    runInBackground(startTemplateBody(app, templatePath), 'Starting the template\'s note', 'Couldn\'t create the template\'s note.');
  };

  return (
    <div className="atlas-te-note" data-te-region="note" data-covered={cover ? '' : undefined}>
      <div ref={previewRef} className={cn('atlas-te-note__editor', readableLineOn(app) && 'is-readable-line-width')}>
        {file ? (
          <div ref={hostRef} className="atlas-te-note__host" style={PLACEHOLDER_STYLE} {...{ [HOSTED_NOTE_ATTRIBUTE]: '' }} />
        ) : templatePath === null ? (
          <div className="atlas-te-note__stand-in">
            <p className="atlas-te-note__line">{unsavedLine(snapshot)}</p>
            {app && snapshot.draftBody !== '' && <DraftBody app={app} text={snapshot.draftBody} />}
          </div>
        ) : (
          <button type="button" className="atlas-te-note__stand-in atlas-te-note__start" onClick={start}>
            <span className="atlas-te-note__line">{BODY_PLACEHOLDER}</span>
          </button>
        )}
      </div>
      {cover}
    </div>
  );
}

/** The text a template never saved will write into its note, rendered as Obsidian renders a note, read only. */
function DraftBody({ app, text }: { app: App; text: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const owner = new Component();
    owner.load();
    runInBackground(MarkdownRenderer.render(app, text, el, '', owner), 'Showing the template\'s text');
    return () => {
      owner.unload();
      el.empty();
    };
  }, [app, text]);
  return <div ref={ref} className="atlas-te-note__draft markdown-rendered" />;
}
