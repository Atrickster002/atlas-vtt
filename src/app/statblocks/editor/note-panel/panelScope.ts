/**
 * The panel's keys (spec §8.5, §8.6): an Obsidian scope pushed only while
 * focus is inside the panel, in its chrome, or in a menu the panel opened
 * (portaled elsewhere in the document, marked with the panel's surface id),
 * so every other Obsidian hotkey keeps working. Mod+Z and Mod+Shift+Z undo
 * the newest of the panel's own actions in the history that took it: the
 * note's (through the writer) or its template's (through the router the pane
 * registers).
 */

import { Scope, type App } from 'obsidian';
import { OWNER_ATTRIBUTE } from '../interaction/chrome';
import type { PanelHistoryRouter } from '../statblock-pane/paneTypes';

export interface PanelScopeHost {
  /** The panel's element; null while hidden. */
  host: () => HTMLElement | null;
  /** The note's own undo or redo; false where its view cannot (Reading view). */
  noteHistory: (kind: 'undo' | 'redo') => boolean;
  /** Says what happened in the panel's live region. */
  say: (text: string) => void;
  /** The note's name, for what is said. */
  noteName: () => string;
}

/** Whether `node` lies in the panel, or in a menu the panel's surface opened. */
export function ownedBy(host: HTMLElement, node: EventTarget | null): boolean {
  const element = node as Partial<Element> | null;
  if (typeof element?.closest !== 'function') return false;
  if (host.contains(element as Element)) return true;
  const surface = host.querySelector('[data-atlas-surface]')?.getAttribute('data-atlas-surface');
  const owner = element.closest(`[${OWNER_ATTRIBUTE}]`)?.getAttribute(OWNER_ATTRIBUTE);
  return surface !== undefined && surface !== null && owner === surface;
}

export class PanelScope {
  private readonly scope: Scope;
  private pushed = false;
  private router: PanelHistoryRouter | null = null;
  private stopWatching: (() => void) | null = null;

  constructor(private readonly app: App, private readonly panel: PanelScopeHost) {
    this.scope = new Scope(app.scope);
    this.scope.register(['Mod'], 'z', () => this.historyKey('undo'));
    this.scope.register(['Mod', 'Shift'], 'z', () => this.historyKey('redo'));
  }

  /** The pane's router, asked before the note's own history. */
  setRouter(router: PanelHistoryRouter | null): void {
    this.router = router;
  }

  /** Follows focus on the panel's host: pushed on focus inside, popped once focus is neither there nor in its menus. */
  watch(host: HTMLElement): () => void {
    const doc = host.doc;
    const onFocusIn = (event: FocusEvent): void => {
      if (ownedBy(host, event.target)) this.push();
      else this.pop();
    };
    doc.addEventListener('focusin', onFocusIn, true);
    this.stopWatching = () => doc.removeEventListener('focusin', onFocusIn, true);
    return () => {
      this.stopWatching?.();
      this.stopWatching = null;
      this.pop();
    };
  }

  pop(): void {
    if (!this.pushed) return;
    this.pushed = false;
    this.app.keymap.popScope(this.scope);
  }

  private push(): void {
    if (this.pushed) return;
    this.pushed = true;
    this.app.keymap.pushScope(this.scope);
  }

  /** Mod+Z and Mod+Shift+Z: a text field of the panel keeps its own undo; else the panel's newest action is undone where it was taken. */
  private historyKey(kind: 'undo' | 'redo'): boolean {
    const host = this.panel.host();
    const active = host?.doc.activeElement;
    if (active && host?.contains(active) && (active.instanceOf(HTMLInputElement) || active.instanceOf(HTMLTextAreaElement))) return true;
    const routed = this.router?.(kind) ?? 'nothing';
    const name = this.panel.noteName();
    const verb = kind === 'undo' ? 'Undid' : 'Redid';
    if (routed === 'template') this.panel.say(`${verb} the template change.`);
    else if (routed === 'elsewhere') this.panel.say(`${kind === 'undo' ? 'Undo' : 'Redo'} that in the template editor.`);
    else this.panel.say(this.panel.noteHistory(kind) ? `${verb} in ${name}.` : `Switch ${name} to editing view to ${kind}.`);
    return false;
  }
}
