import { Platform } from 'obsidian';

/** What the pane says after taking something out of the note: what went, and how to get it back. */
export function removedMessage(what: string, verb: 'Deleted' | 'Removed' = 'Deleted'): string {
  return `${verb} ${what}. Press ${Platform.isMacOS ? 'Cmd+Z' : 'Ctrl+Z'} to undo.`;
}
