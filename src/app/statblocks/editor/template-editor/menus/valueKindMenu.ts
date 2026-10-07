/**
 * Kind of value, from the selected block's toolbar: what the block's property
 * holds, with a tick on the kind in use. A choice adds its switches (several
 * at once, a number with each) and "Edit choices…", which opens Settings at
 * the choices; turning a property without choices into one opens them at once.
 * Each change is one session step.
 */

import { blockSpec } from '../../../model/blockCatalogue';
import { coreSlotOf } from '../../../model/coreSlots';
import { updateField, type FieldChanges } from '../../../model/fieldOps';
import type { FieldType, StatblockTemplate, TemplateBlock, TemplateField } from '../../../model/templateTypes';
import { SEPARATOR, type SurfaceAction } from '../../interaction/surfaceActions';
import { FIELD_TYPE_LABELS } from '../editorGlyphs';
import { boundFieldOf } from '../inspector/blockEdits';
import type { EditorSession } from '../sessionTypes';

/** The property whose kind the block's toolbar offers to change: a block that may show more than one kind, never a core slot or a Line (one per value). */
export function kindChangeableField(template: StatblockTemplate, block: TemplateBlock): TemplateField | null {
  if (block.type === 'line' || blockSpec(block.type).binds.length < 2 || coreSlotOf(template.layout, block.id)) return null;
  return boundFieldOf(template, block) ?? null;
}

export interface ValueKindContext {
  session: EditorSession;
  block: TemplateBlock;
  field: TemplateField;
  editable: boolean;
  /** Opens Settings with the choices in view and focused. */
  editChoices: () => void;
}

function item(id: string, label: string, run: () => void, extra: Partial<Extract<SurfaceAction, { kind: 'item' }>> = {}): SurfaceAction {
  return { kind: 'item', id, label, run, ...extra };
}

export function valueKindMenu({ session, block, field, editable, editChoices }: ValueKindContext): SurfaceAction[] {
  const edit = (changes: FieldChanges): void => session.apply((template) => updateField(template, field.key, changes));
  const kinds = blockSpec(block.type).binds.map((type: FieldType) => item(`kind-${type}`, FIELD_TYPE_LABELS[type], () => {
    edit({ type });
    if (type === 'choice' && !field.options?.length) editChoices();
  }, { checked: field.type === type, disabled: !editable }));
  if (field.type !== 'choice') return kinds;
  return [
    ...kinds,
    SEPARATOR,
    item('pick-several', 'Pick several', () => edit({ several: field.several ? undefined : true }), { checked: field.several === true, disabled: !editable }),
    item('each-with-number', 'Each with a number', () => edit({ numbered: field.numbered ? undefined : true }), { checked: field.numbered === true, disabled: !editable }),
    SEPARATOR,
    item('edit-choices', 'Edit choices…', editChoices, { icon: 'list' }),
  ];
}
