/**
 * What the import report does besides the batch: the Track blocks put in
 * place of the scripts that drew tracks, through the template's session so
 * an open template editor shows them at once and can undo them as one step;
 * and the scripts the template still keeps, which the batch's summary names.
 */

import type { App } from 'obsidian';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import { TemplateSession } from '../../library/TemplateSession';
import { flattenReadingOrder } from '../../model/treeQueries';
import { withTrackBlocks } from '../../fs/fsTrackReplacement';
import type { TemplateId } from '../../model/templateTypes';

/**
 * Replaces the template's track-drawing scripts with Track blocks, one undo
 * step, and saves it. A template editor holding unsaved changes of the
 * template keeps the replacement in its draft, to be saved with the rest.
 * Resolves false when nothing was replaced (no such script, a read-only
 * template) or the template could not be saved.
 */
export async function replaceTrackScripts(app: App, templateId: TemplateId): Promise<boolean> {
  const session = TemplateSession.open(app, templateId);
  if (!session) return false;
  try {
    const before = session.getSnapshot();
    session.apply((template) => withTrackBlocks(template));
    if (session.getSnapshot().template === before.template) return false;
    if (before.dirty) return true;
    return (await session.save()).ok;
  } finally {
    session.release();
  }
}

/** What the template's scripts kept for Fantasy Statblocks do, in reading order: what Atlas shows only as placeholders. */
export function keptScripts(app: App, templateId: TemplateId): string[] {
  const template = TemplateLibrary.forApp(app).get(templateId)?.template;
  if (!template) return [];
  return flattenReadingOrder(template.layout.blocks).flatMap((block) => (block.type === 'script' ? [block.summary] : []));
}
