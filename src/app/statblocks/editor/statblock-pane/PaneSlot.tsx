import React, { useRef } from 'react';
import type { TemplateBlock, TemplateField } from '../../model/templateTypes';
import { blockDisplay } from '../../render/blockDisplay';
import { ChoiceValueInput } from './ChoiceValueInput';
import { ConflictChip } from './ConflictChip';
import { DerivedValue, patternInWords } from './DerivedValue';
import { entryList, shownEntryIndexes } from './entryPatches';
import { EntryInlineEditor } from './EntryInlineEditor';
import { focusStaysIn } from './focusWithin';
import { ListValueInput } from './ListValueInput';
import { MarkdownValueInput } from './MarkdownValueInput';
import { usePaneEdit, type EditTarget, type PaneEditController } from './paneEditContext';
import { TextValueInput } from './TextValueInput';
import { TokenSocket } from '../token-socket/TokenSocket';

/** The input for one field, by its type group (§7.6). */
function FieldInput({ field, autoFocus }: { field: TemplateField; autoFocus: boolean }): React.JSX.Element {
  switch (field.type) {
    case 'list': return <ListValueInput field={field} autoFocus={autoFocus} />;
    case 'markdown': case 'spells': return <MarkdownValueInput field={field} autoFocus={autoFocus} />;
    case 'choice': return field.options?.length
      ? <ChoiceValueInput field={field} autoFocus={autoFocus} />
      : <TextValueInput field={field} autoFocus={autoFocus} />;
    default: return <TextValueInput field={field} autoFocus={autoFocus} />;
  }
}

interface BlockEditorProps {
  block: TemplateBlock;
  fields: readonly TemplateField[];
  target: EditTarget;
}

/**
 * What stands where a block's values show while one of its fields is edited:
 * an input per field, in the order the block writes them, focus on the one
 * clicked or reached with Tab. Focus leaving the block ends editing. A list
 * of abilities is not replaced: its one ability being typed has its editor
 * in its own place (`PaneEntry`), and an empty list its first new one.
 */
function BlockEditor({ block, fields, target, values }: BlockEditorProps & { values: React.ReactNode }): React.ReactNode {
  const pane = usePaneEdit();
  const ref = useRef<HTMLSpanElement>(null);
  const entries = block.type === 'entries' ? fields.find((field) => field.type === 'entries' && field.key === target.field) : undefined;
  if (block.type === 'entries' && entries) {
    const shown = shownEntryIndexes(entryList(pane.read(entries).value), entries.entry);
    return shown.length > 0 ? values : <EntryInlineEditor block={block} field={entries} editing={{ kind: 'new', afterIndex: null, shown: 0 }} />;
  }
  const onBlur = (event: React.FocusEvent): void => {
    if (!focusStaysIn(ref.current, event.relatedTarget)) pane.leave(block.id);
  };

  return (
    <span ref={ref} className="atlas-sb-pane-editor" onBlur={onBlur}>
      {fields.map((field, index) => (
        <React.Fragment key={field.key}>
          {index > 0 && ' '}
          <FieldInput field={field} autoFocus={field.key === target.field} />
        </React.Fragment>
      ))}
    </span>
  );
}

/** How a value the template works out is made, while the block shows its fallback; null otherwise. */
function derivedWords(block: TemplateBlock, pane: PaneEditController): string | null {
  if (!block.fallback || blockDisplay(block, pane.sheet)?.state !== 'fallback') return null;
  return patternInWords(block.fallback, pane.sheet.context.labelOf);
}

/** A block's values at rest, with what the pane has to say about them: a conflict, or how a value is worked out. */
function PaneSlot({ block, values }: { block: TemplateBlock; values: React.ReactNode }): React.ReactNode {
  const pane = usePaneEdit();
  if (block.type === 'image') return <TokenSocket block={block} art={values} />;
  const fields = pane.spots.byBlock.get(block.id) ?? [];
  // A value that does not fit its type has its chip from the renderer, inside `values`.
  const marks = fields.flatMap((field) => {
    const conflict = pane.conflicts.get(field.key);
    return conflict ? [<ConflictChip key={field.key} field={field} conflict={conflict} />] : [];
  });
  const editing = pane.editing?.blockId === block.id && fields.length > 0 ? pane.editing : null;
  // A list stays drawn while one of its abilities is typed, with what the pane has to say about it.
  if (editing && block.type !== 'entries') return <BlockEditor block={block} fields={fields} target={editing} values={values} />;
  const shown = editing ? <BlockEditor block={block} fields={fields} target={editing} values={values} /> : values;
  const words = editing ? null : derivedWords(block, pane);
  const drawn = words ? <DerivedValue words={words}>{shown}</DerivedValue> : shown;
  return marks.length ? <>{drawn}{marks}</> : drawn;
}

/** The pane's `ValueEditing.slot`: one element type, so a block's values keep their place in the tree. */
export function renderPaneSlot(block: TemplateBlock, values: React.ReactNode): React.ReactNode {
  return <PaneSlot block={block} values={values} />;
}
