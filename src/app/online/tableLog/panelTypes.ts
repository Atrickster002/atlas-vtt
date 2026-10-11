import type { LogReactionEmoji, RollEntry } from '../protocol/index.ts';
import type { LogState } from './LogState.ts';

/** What a viewer does to the log; the host sends it on. The panel changes nothing itself: it follows `LogState`. */
export interface LogActions {
  say(text: string, reply?: string): void;
  edit(id: string, text: string): void;
  remove(id: string): void;
  react(id: string, emoji: LogReactionEmoji, on: boolean): void;
  /** Empties the log for everyone; only the GM has it. */
  clear?(): void;
}

/** The token a roll names, as this viewer may know it: its name (null where the viewer is told none) and its portrait. */
export interface RollFace {
  readonly name: string | null;
  readonly portrait: { readonly src: string; readonly showRing?: boolean; readonly ringColor?: string } | null;
}

export interface TableLogPanelProps {
  readonly state: LogState;
  readonly actions: LogActions;
  readonly self: string | null;
  /** May delete any chat message (the GM). */
  readonly moderator: boolean;
  /** Whether what is typed can be sent now (connected, GM there); else the composer is disabled and says why (`offlineText`). */
  readonly canSend: boolean;
  readonly offlineText?: string;
  /** The token a roll names, as this viewer may know it; null when unknown (then only the roller's name shows). */
  readonly rollFace?: (entry: RollEntry) => RollFace | null;
  /** 'floating': the fixed panel at the left edge with header, pin and close; 'embedded': fills its container (a phone's sheet, which has its own title and close). */
  readonly variant: 'floating' | 'embedded';
  readonly onClose: () => void;
}

/** What a row may do; one object for all rows, the same while the panel's props stay. */
export interface RowApi {
  readonly self: string | null;
  readonly moderator: boolean;
  readonly react: (id: string, emoji: LogReactionEmoji, on: boolean) => void;
  readonly reply: (id: string) => void;
  /** Opens a message of the viewer's own for editing in its place. */
  readonly edit: (id: string) => void;
  readonly saveEdit: (id: string, text: string) => void;
  readonly cancelEdit: () => void;
  /** Shows or drops the question a row's tools ask before deleting. */
  readonly askDelete: (id: string | null) => void;
  readonly remove: (id: string) => void;
  /** A tap on a row with a finger or pen: shows its tools, or hides them again. */
  readonly tap: (id: string) => void;
  /** Scrolls to an entry and marks it for a moment; nothing where the list no longer has it. */
  readonly jumpTo: (id: string) => void;
}

/** What the panel knows of one row; all false for most rows, so they render once. */
export interface RowFlags {
  readonly editing: boolean;
  readonly asking: boolean;
  readonly tapped: boolean;
  readonly highlighted: boolean;
  /** The one row the Tab key reaches; the arrow keys move between rows. */
  readonly tabStop: boolean;
}
