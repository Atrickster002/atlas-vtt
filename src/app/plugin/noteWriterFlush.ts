import type { Plugin } from 'obsidian';
import { flushTemplateSessions, flushTemplateSessionsForExit, releaseTemplateSessions } from '../statblocks/library/sessionRegistry';
import { NoteFieldWriter } from '../statblocks/notes/NoteFieldWriter';
import { NoteSource } from '../statblocks/notes/noteSource';
import { runInBackground } from '../utils/backgroundTask';

/**
 * Statblock and template edits are never lost on the way out (§8.5, §8.7): Obsidian awaits the
 * workspace's `quit` tasks before it quits, a closing popout takes its editors with it, and
 * unloading the plugin starts the last flush (Obsidian does not await an unload).
 */
export function registerNoteWriterFlush(plugin: Plugin): void {
  const { app } = plugin;
  plugin.registerEvent(app.workspace.on('quit', (tasks) => {
    tasks.add(() => Promise.all([NoteFieldWriter.forApp(app).flushAll(), flushTemplateSessionsForExit(app)]));
  }));
  plugin.registerEvent(app.workspace.on('window-close', () => {
    runInBackground(NoteFieldWriter.forApp(app).flushAll(), 'Saving statblock edits');
    runInBackground(flushTemplateSessions(app), 'Saving statblock templates');
  }));
  plugin.register(() => {
    NoteFieldWriter.release(app);
    NoteSource.release(app);
    runInBackground(releaseTemplateSessions(app), 'Saving statblock templates');
  });
}
