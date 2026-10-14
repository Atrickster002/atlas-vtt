import { useMemo } from 'react';
import type { App } from 'obsidian';
import { builtInTemplate } from '../../../statblocks/library/builtInTemplates';
import { useTemplateLibrary } from '../../../statblocks/library/useTemplateLibrary';
import type { StatblockRole } from '../../../statblocks/model/roleTypes';
import { isBuiltInTemplateId, type StatblockTemplate, type TemplateId } from '../../../statblocks/model/templateTypes';

/** The templates the roles start from, each once in role order; a template that is missing is left out. */
export function roleTemplatesOf(roles: readonly StatblockRole[], lookup: (id: TemplateId) => StatblockTemplate | null): StatblockTemplate[] {
  const templates = new Map<TemplateId, StatblockTemplate>();
  for (const { templateId } of roles) {
    const template = templates.has(templateId) ? null : lookup(templateId);
    if (template) templates.set(templateId, template);
  }
  return [...templates.values()];
}

/**
 * The templates of a collection's statblock roles, read while `active`. Built-ins are read
 * directly; the template library is followed only while a role names a template of the vault,
 * so it is not loaded for collections whose roles all start from built-ins.
 */
export function useRoleTemplates(app: App | null, roles: readonly StatblockRole[], active: boolean): readonly StatblockTemplate[] {
  const needsVault = active && roles.some((role) => !isBuiltInTemplateId(role.templateId));
  const snapshot = useTemplateLibrary(needsVault ? app : null);
  return useMemo(() => {
    if (!active) return [];
    const inVault = (id: TemplateId): StatblockTemplate | undefined => snapshot?.templates.find((entry) => entry.template.id === id)?.template;
    return roleTemplatesOf(roles, (id) => (isBuiltInTemplateId(id) ? builtInTemplate(id)?.template : inVault(id)) ?? null);
  }, [active, roles, snapshot]);
}
