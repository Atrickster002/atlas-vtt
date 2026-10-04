import { Notice, type App } from 'obsidian';
import { copyTemplate } from '../../library/templateActions';
import type { TemplateId } from '../../model/templateTypes';
import type { FieldRecord } from '../../values/fieldValues';
import { noteName } from '../../../utils/pathUtils';
import type { PaneServices } from '../paneServices';
import { templateKeyPatch } from './templateKeyPatch';

/**
 * "Make a separate template for this statblock…" (spec §5.5, §9.1): a copy of
 * the note's template named after the note, which only this note then names.
 * Atlas never makes such a copy on its own. Returns what to say.
 */
export async function makeSeparateTemplate(
  app: App, writer: PaneServices['writer'], notePath: string, record: FieldRecord, templateId: TemplateId,
): Promise<string> {
  const name = noteName(notePath);
  try {
    const copy = await copyTemplate(app, templateId, `${name} template`);
    const outcome = await writer.write(notePath, [templateKeyPatch(record, copy.id)]);
    const said = outcome.problem || outcome.conflicts.length
      ? `Made ${name} template, but ${name} could not switch to it.`
      : `${name} uses its own template now: ${name} template.`;
    new Notice(said);
    return said;
  } catch (error) {
    console.error('[Atlas] Making a separate template failed:', error);
    new Notice("Couldn't make the template.");
    return "Couldn't make the template.";
  }
}
