/**
 * What Save does with the name typed (the template editor's save dialog):
 * the template's own name updates its file, another name saves a new
 * template and leaves the original as it is. A built-in is never updated,
 * and a template never saved takes its first name. `saveChoice` is pure;
 * `nameTakenIn` reads the templates it is given and the vault.
 */

import type { App } from 'obsidian';
import type { LibraryTemplate } from '../../../model/resolvedTypes';
import type { TemplateId } from '../../../model/templateTypes';
import { TEMPLATE_FOLDER, templateNameProblem, templateNameTakenAt, templatePathIn } from '../../../library/templatePaths';
import type { SessionSnapshot } from '../sessionTypes';

export type SaveKind = 'update' | 'new';

/** What the dialog's primary button does with a name. */
export interface SaveRequest {
  kind: SaveKind;
  name: string;
}

export interface SaveChoice {
  kind: SaveKind;
  /** The primary button's label. */
  label: 'Update' | 'Save as new' | 'Save';
  /** Why the name cannot be saved under; null while it can. */
  problem: string | null;
  /** The line under the name: what saving does. */
  hint: string | null;
}

/** What the choice reads of the template being saved. */
export type SaveSubject = Pick<SessionSnapshot, 'id' | 'name' | 'builtIn' | 'unsaved'>;

/** Whether another template already goes by a name. */
export type NameTaken = (name: string) => boolean;

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function saveChoice(subject: SaveSubject, typed: string, taken: NameTaken): SaveChoice {
  const name = typed.trim();
  const problem = templateNameProblem(name) ?? (taken(name) ? `There is already a template named “${name}”.` : null);
  if (subject.unsaved) return { kind: 'new', label: 'Save', problem, hint: null };
  if (subject.builtIn) {
    const own = sameName(name, subject.name) ? 'Built-in templates can\'t be changed. Give yours a name of its own.' : null;
    return { kind: 'new', label: 'Save as new', problem: own ?? problem, hint: `${subject.name} is built in and stays as it is. Your changes are saved as a new template.` };
  }
  if (sameName(name, subject.name)) return { kind: 'update', label: 'Update', problem: null, hint: 'Statblocks that use this template show the change.' };
  return { kind: 'new', label: 'Save as new', problem, hint: `${subject.name} stays as it is.` };
}

/** `base`, else `base 2`, `base 3`, … : the first name no template goes by. */
export function freeName(base: string, taken: NameTaken): string {
  const stem = base.trim();
  let name = stem;
  for (let n = 2; taken(name); n++) name = `${stem} ${n}`;
  return name;
}

/**
 * Whether a template other than `except` goes by the name, built-ins included,
 * or a file of that name (or its note) stands where new templates are saved.
 */
export function nameTakenIn(templates: readonly LibraryTemplate[], except: TemplateId, app?: App): NameTaken {
  return (name) => templates.some((entry) => entry.template.id !== except && sameName(entry.name, name))
    || (app !== undefined && !templateNameProblem(name) && templateNameTakenAt(app, templatePathIn(TEMPLATE_FOLDER, name)));
}
