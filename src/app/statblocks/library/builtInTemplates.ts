/** The templates built into Atlas, read-only, looked up by id. */

import type { BuiltInTemplate } from '../model/templateTypes';
import { BUILT_IN_TEMPLATES } from '../presets';

const BY_ID: ReadonlyMap<string, BuiltInTemplate> = new Map(BUILT_IN_TEMPLATES.map((builtIn) => [builtIn.id, builtIn]));

/** Every built-in, in the order pickers list them. Frozen: copy before editing. */
export function allBuiltInTemplates(): readonly BuiltInTemplate[] {
  return BUILT_IN_TEMPLATES;
}

/** The built-in with this id, or null when Atlas has none by that id. */
export function builtInTemplate(id: string): BuiltInTemplate | null {
  return BY_ID.get(id) ?? null;
}
