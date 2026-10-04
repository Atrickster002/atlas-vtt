import React, { useState, useSyncExternalStore } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { SurfaceMenuProvider } from '../../../../src/app/statblocks/editor/interaction/SurfaceMenuProvider';
import { TemplateEditorContext, type TemplateEditorContextValue } from '../../../../src/app/statblocks/editor/template-editor/editorContext';
import type { BlockSelection } from '../../../../src/app/statblocks/editor/template-editor/selection';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { FakeSession, sampleTemplate } from './editorKit';

const host: TemplateEditorHost = { openTemplate: vi.fn(), openNote: vi.fn(), close: vi.fn() };

export interface Mounted {
  session: FakeSession;
  /** A block's frame in the canvas. */
  frame: (id: string) => HTMLElement;
}

/** The template editor with its real dock, dock panels and Settings panel; `dock` opens one of its panels. */
export function mountEditor(session = new FakeSession(sampleTemplate()), options: { dock?: string; menus?: boolean } = {}): Mounted {
  const editor = (
    <div className="atlas-vtt-plugin">
      <TemplateEditor
        session={session}
        host={host}
        previewPath={null}
        onShowWithChange={vi.fn()}
        collectionId={null}
        onCollectionChange={vi.fn()}
      />
    </div>
  );
  // Menus open through the surface's own provider, as in the view (StatblockEditorRoot).
  render(<TooltipProvider>{options.menus ? <SurfaceMenuProvider ownerId="test">{editor}</SurfaceMenuProvider> : editor}</TooltipProvider>);
  if (options.dock) openDock(options.dock);
  const frame = (id: string): HTMLElement => {
    const element = document.querySelector<HTMLElement>(`.atlas-te-stage [data-block-id="${id}"]`);
    if (!element) throw new Error(`no frame ${id}`);
    return element;
  };
  return { session, frame };
}

/** Opens a dock panel by its button's name (Add, Structure, Properties, Template); returns the panel. */
export function openDock(name: string): HTMLElement {
  const dock = document.querySelector<HTMLElement>('.atlas-te-dock');
  if (!dock) throw new Error('no dock');
  const button = [...dock.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent === name);
  if (!button) throw new Error(`no dock button ${name}`);
  if (!button.classList.contains('is-active')) act(() => button.click());
  const panel = document.querySelector<HTMLElement>('.atlas-te-dock-panel');
  if (!panel) throw new Error(`no dock panel ${name}`);
  return panel;
}

/** The Settings panel's content for the selection now, opened with Shift+Enter if it is closed; the one before fades out beside it. */
export function settingsPanel(): HTMLElement {
  if (!document.querySelector('.atlas-te-settings')) {
    const root = document.querySelector<HTMLElement>('.atlas-te');
    if (!root) throw new Error('no editor');
    fireEvent.keyDown(root, { key: 'Enter', shiftKey: true });
  }
  const content = [...document.querySelectorAll<HTMLElement>('.atlas-te-settings .atlas-te-insp__fade')].at(-1);
  if (!content) throw new Error('no settings');
  return content;
}

export interface ContextOptions {
  collectionKeys?: ReadonlyMap<string, number>;
  selection?: BlockSelection;
}

/** Renders a part inside an editor context of its own: a session's live snapshot and the given collection keys. */
export function renderInEditor(session: FakeSession, ui: React.ReactElement, options: ContextOptions = {}): { selected: () => BlockSelection } {
  const seen = { selection: options.selection ?? [] as BlockSelection };
  function Host(): React.JSX.Element {
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
    const [selection, setSelection] = useState<BlockSelection>(options.selection ?? []);
    seen.selection = selection;
    const value: TemplateEditorContextValue = {
      app: undefined,
      session,
      snapshot,
      selection,
      select: (next) => setSelection(next),
      insert: vi.fn(),
      editLabel: vi.fn(),
      announce: vi.fn(),
      collectionId: null,
      collectionKeys: options.collectionKeys ?? new Map(),
      openSettings: vi.fn(),
    };
    return (
      <TooltipProvider>
        <div className="atlas-vtt-plugin">
          <TemplateEditorContext.Provider value={value}>{ui}</TemplateEditorContext.Provider>
        </div>
      </TooltipProvider>
    );
  }
  render(<Host />);
  return { selected: () => seen.selection };
}

/** Types into an input as one typing session: each value in turn, then leaves it. */
export function typeAndLeave(input: HTMLElement, ...values: string[]): void {
  for (const value of values) fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

export const key = (target: Element, name: string, init: KeyboardEventInit = {}): void => {
  fireEvent.keyDown(target, { key: name, ...init });
};
