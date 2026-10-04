import React, { useEffect, useRef, useState } from 'react';
import { Component, MarkdownRenderer, TFile, type App } from 'obsidian';
import { Button } from '../../../../packages/components/primitives/button';
import { cn } from '../../../../../utils/cn';
import { runInBackground } from '../../../../utils/backgroundTask';
import { noteName } from '../../../../utils/pathUtils';
import { notePreviewText, SAMPLE_NOTE_BODY, SAMPLE_NOTE_TITLE } from './notePreviewText';
import { inlineTitleOn, readableLineOn } from './obsidianConfig';
import type { ShowWith } from './showWith';

/** A note changed while shown is drawn again once its writes settle. */
const RERENDER_DELAY_MS = 300;
/** A click into the note shows its chip this long. */
const CHIP_SHOWN_MS = 2000;

/** The text of the note at `path`, followed as it changes; null while unread or for no note. */
function useNoteText(app: App | undefined, path: string | null): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(null);
    if (!app || !path) return undefined;
    let current = true;
    let timer: number | undefined;
    const read = (): void => {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;
      app.vault.cachedRead(file).then(
        (read) => { if (current) setText(read); },
        (error: unknown) => console.error(`[Atlas] Reading ${path} for the template editor failed:`, error),
      );
    };
    read();
    const ref = app.vault.on('modify', (file) => {
      if (file.path !== path) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(read, RERENDER_DELAY_MS);
    });
    return () => {
      current = false;
      window.clearTimeout(timer);
      app.vault.offref(ref);
    };
  }, [app, path]);
  return text;
}

export interface NoteBodyPreviewProps {
  app: App | undefined;
  showWith: ShowWith;
  /** The rendered note's text element, whose readable line the panel's default width follows. */
  previewRef: React.Ref<HTMLDivElement>;
  onOpenNote: (path: string) => void;
}

/**
 * The note column of the template editor (§2.2): the note the card is shown
 * with, rendered read-only as Reading view renders it, with Obsidian's readable
 * line width and inline title; for Sample and Empty, a neutral sample note.
 * Never dimmed; a chip says it is a preview and opens the note.
 */
export function NoteBodyPreview({ app, showWith, previewRef, onOpenNote }: NoteBodyPreviewProps): React.JSX.Element {
  const path = showWith.kind === 'note' ? showWith.path : null;
  const text = useNoteText(app, path);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [flashed, setFlashed] = useState(false);
  const title = path ? noteName(path) : SAMPLE_NOTE_TITLE;
  const markdown = path ? notePreviewText(text ?? '') : SAMPLE_NOTE_BODY;

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !app) return undefined;
    body.replaceChildren();
    const component = new Component();
    component.load();
    runInBackground(MarkdownRenderer.render(app, markdown, body, path ?? '', component), 'Rendering the template editor\'s note');
    return () => {
      component.unload();
      body.replaceChildren();
    };
  }, [app, markdown, path]);

  useEffect(() => {
    if (!flashed) return undefined;
    const timer = window.setTimeout(() => setFlashed(false), CHIP_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [flashed]);

  return (
    <div className="atlas-te-note" data-te-region="note" onPointerDown={() => setFlashed(true)}>
      <div className="markdown-reading-view atlas-te-note__reader">
        <div ref={previewRef} className={cn('markdown-preview-view', 'markdown-rendered', readableLineOn(app) && 'is-readable-line-width')}>
          <div className="markdown-preview-sizer markdown-preview-section">
            {inlineTitleOn(app) && (
              <div className="mod-header mod-ui">
                <div className="inline-title">{title}</div>
              </div>
            )}
            {/* Without Obsidian (a test) the text stands as one paragraph. */}
            {app ? <div ref={bodyRef} className="atlas-te-note__body" /> : <div className="atlas-te-note__body"><p>{markdown}</p></div>}
          </div>
        </div>
      </div>
      <div className="atlas-te-note-chip" data-shown={flashed ? '' : undefined}>
        <span>{path ? `Read-only preview of ${title}` : 'Read-only sample note'}</span>
        {path && (
          <Button type="button" variant="ghost" size="sm" className="atlas-te-note-chip__open" onClick={() => onOpenNote(path)}>
            Open note
          </Button>
        )}
      </div>
    </div>
  );
}
