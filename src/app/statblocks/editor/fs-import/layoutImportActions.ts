/**
 * What the import report does besides the batch: the Track blocks put in
 * place of the scripts that drew tracks, through the template's session so
 * an open template editor shows them at once and can undo them as one step.
 */

import type { App } from 'obsidian';
import { TemplateSession } from '../../library/TemplateSession';
import { withTrackBlocks } from '../../fs/fsTrackReplacement';
import type { TemplateId } from '../../model/templateTypes';

/**
 * Replaces the template's track-drawing scripts with Track blocks, one undo
 * step, and writes it. Resolves false when nothing was replaced (no such
 * script, a read-only template) or the template could not be saved.
 */
export async function replaceTrackScripts(app: App, templateId: TemplateId): Promise<boolean> {
  const session = TemplateSession.open(app, templateId);
  if (!session) return false;
  try {
    const before = session.getSnapshot().template;
    session.apply((template) => withTrackBlocks(template));
    if (session.getSnapshot().template === before) return false;
    await session.flush();
    return session.getSnapshot().saveState === 'saved';
  } finally {
    session.release();
  }
}
