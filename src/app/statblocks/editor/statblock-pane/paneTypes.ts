import type { App } from 'obsidian';
import type { PaneServices } from '../paneServices';
import type { HistoryResult } from './panelHistory';

/** Undoes or redoes the newest of the panel's own actions, in the history that took it (§8.5). */
export type PanelHistoryRouter = (kind: 'undo' | 'redo') => HistoryResult;

/** What the pane's note is, as far as editing goes. */
export type PaneNoteKind =
  | 'loading'
  /** A native statblock: values are edited here. */
  | 'atlas'
  /** No longer a native statblock (its template key went); the panel leaves once the metadata cache says so. */
  | 'fantasy'
  | 'none'
  /** Its YAML is broken: Atlas never writes into it. */
  | 'unreadable'
  | 'deleted';

/**
 * Actions the pane hands back to its panel, and the ones other parts of Atlas
 * wire in: a pane offers an action of the second kind only once it is given.
 */
export interface StatblockPaneActions {
  /** Shows the note's Properties in this view again (D7). */
  showProperties: () => void;
  changeCollection: (collectionId: string) => void;
  /** Hides the statblock beside its note (on this device, for every note). */
  hide?: (() => void) | undefined;
  /** Opens the template editor in this note's leaf, showing the note's statblock (§8.4). */
  editTemplate?: ((templateId: string, collectionId: string | null, notePath: string) => void) | undefined;
  linkToToken?: ((notePath: string, collectionId: string) => void) | undefined;
  /** Opens the template editor in this note's leaf with a block selected ("Edit in template"). */
  openTemplateAt?: ((target: TemplateBlockTarget) => void) | undefined;
  /** The panel's Mod+Z asks this first; null takes it back. Unset where the host routes no keys. */
  registerHistory?: ((router: PanelHistoryRouter | null) => void) | undefined;
}

/** A block of a template, to open the template editor on, previewing the note it was added from. */
export interface TemplateBlockTarget {
  templateId: string;
  /** The template's file, which the library may not have read yet (a copy made a moment ago); null for a built-in. */
  path: string | null;
  blockId: string;
  collectionId: string | null;
  notePath: string;
}

/** The input being edited registers its commit here, so closing the panel mid-word keeps the word. */
export interface PendingCommit {
  current: (() => Promise<void>) | null;
}

export interface StatblockPaneProps {
  app: App;
  services: PaneServices;
  notePath: string;
  /** The collection the panel works for; null until one is chosen or resolved. */
  collectionId: string | null;
  /** Whether Properties show in the note's view (the user chose Show Properties). */
  propertiesShown: boolean;
  /** The last thing said to assistive technology ("Undid in Marsh Warden."). */
  announcement: string;
  /** Raised when an entry point asks for it (a statblock just created): focus moves to the first empty value. */
  focusRequest: number;
  pendingCommit: PendingCommit;
  actions: StatblockPaneActions;
}
