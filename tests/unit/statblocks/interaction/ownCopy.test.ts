import { describe, expect, it } from 'vitest';
import { withRoleTemplates } from '../../../../src/app/statblocks/bundles/bundleTemplateIds';
import { ownCopyOf, withOwnCopy } from '../../../../src/app/statblocks/library/ownCopy';
import type { LibraryTemplate } from '../../../../src/app/statblocks/model/resolvedTypes';
import { comparableSettings } from '../../../../src/app/services/collectionBundle/bundleSettings';
import { template } from '../template-editor/editorKit';

const BUILT_IN = 'builtin:5e-2014-monster';

function library(entries: LibraryTemplate[]): { get: (id: string) => LibraryTemplate | null } {
  return { get: (id) => entries.find((entry) => entry.template.id === id) ?? null };
}

function vaultTemplate(id: string, derivedFrom?: string): LibraryTemplate {
  return {
    template: { ...template([], [], id), ...(derivedFrom && { derivedFrom: { templateId: derivedFrom, revision: 1 } }) },
    name: id, status: 'ok', builtIn: false, path: `atlas-vtt/statblock-templates/${id}.atlastemplate`,
  };
}

/** One copy per collection and built-in (spec §9.1, B5). */
describe('ownCopyOf', () => {
  it('finds the recorded copy where it still derives from the built-in', () => {
    const copy = vaultTemplate('copy-abc123', BUILT_IN);
    expect(ownCopyOf({ templateCopies: { [BUILT_IN]: 'copy-abc123' } }, library([copy]), BUILT_IN)).toBe(copy);
  });

  it('ignores a record whose template is gone, derives from another, or is a built-in', () => {
    expect(ownCopyOf({ templateCopies: { [BUILT_IN]: 'gone-abc123' } }, library([]), BUILT_IN)).toBeNull();
    const other = vaultTemplate('other-abc123', 'builtin:generic-creature');
    expect(ownCopyOf({ templateCopies: { [BUILT_IN]: 'other-abc123' } }, library([other]), BUILT_IN)).toBeNull();
    expect(ownCopyOf({ templateCopies: { [BUILT_IN]: 'builtin:generic-creature' } }, library([]), BUILT_IN)).toBeNull();
    expect(ownCopyOf(undefined, library([]), BUILT_IN)).toBeNull();
  });

  it('records a copy beside the others', () => {
    expect(withOwnCopy({ templateCopies: { 'builtin:x': 'x-copy' } }, BUILT_IN, 'copy-abc123')).toEqual({
      templateCopies: { 'builtin:x': 'x-copy', [BUILT_IN]: 'copy-abc123' },
    });
  });

  it('is bookkeeping a bundle never compares, and an import points it at the copy\'s id in this vault', () => {
    expect(comparableSettings({ conditions: [], templateCopies: { [BUILT_IN]: 'copy-abc123' } })).toEqual({ conditions: [] });
    const settings = withRoleTemplates({ templateCopies: { [BUILT_IN]: 'copy-abc123' } }, new Map([['copy-abc123', 'copy-def456']]));
    expect(settings.templateCopies).toEqual({ [BUILT_IN]: 'copy-def456' });
  });
});
