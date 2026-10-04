import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { isExpressionError } from '../../../expressions/errors';
import { parseFormula } from '../../../expressions/parse';
import { findBlock } from '../../../model/treeQueries';
import type { ScoreColumn, ScoresBlock, StatblockTemplate } from '../../../model/templateTypes';
import { withBlockChanges } from './blockEdits';
import { FieldSetting } from './FieldSetting';
import type { GroupProps } from './groupProps';
import { ChoiceSetting, SelectSetting, TextSetting } from './InspectorControls';

/** What a column reads per slot (§7.5): a formula of the slot's value, or a property's entry with a formula where it has none. */
type ColumnKind = 'formula' | 'field';

const KINDS: Array<{ value: ColumnKind; label: string }> = [
  { value: 'formula', label: 'A formula' },
  { value: 'field', label: 'A property' },
];

/** What a new column works out: the slot's value itself, until the author types a formula of it. */
const NEW_COLUMN_FORMULA = 'value';

/** What is wrong with a typed formula, in plain words. */
function formulaProblem(text: string): string | null {
  if (!text.trim()) return 'Type a formula of value, like value * 2 or floor(value / 2).';
  const parsed = parseFormula(text);
  return isExpressionError(parsed) ? parsed.message : null;
}

/** An optional formula: empty is fine. */
function fallbackProblem(text: string): string | null {
  return text.trim() ? formulaProblem(text) : null;
}

function kindOf(column: ScoreColumn): ColumnKind {
  return column.field !== undefined ? 'field' : 'formula';
}

/** The template with the Scores block's columns changed by `edit`, read from the block as the template holds it now. */
function withColumns(template: StatblockTemplate, id: string, edit: (columns: ScoreColumn[]) => ScoreColumn[]): StatblockTemplate {
  const found = findBlock(template.layout.blocks, id)?.block;
  if (found?.type !== 'scores') return template;
  const columns = edit([...(found.columns ?? [])]);
  return withBlockChanges(template, id, 'scores', { columns: columns.length > 0 ? columns : undefined });
}

/** A copy of the column without one of its settings. */
function without(column: ScoreColumn, key: keyof ScoreColumn): ScoreColumn {
  const copy = { ...column };
  delete copy[key];
  return copy;
}

/** A column that works out a formula again: its field goes, and it needs a formula. */
function asFormula(column: ScoreColumn): ScoreColumn {
  return { ...without(column, 'field'), formula: column.formula ?? NEW_COLUMN_FORMULA };
}

interface ColumnProps extends GroupProps {
  block: ScoresBlock;
  column: ScoreColumn;
  index: number;
}

function ColumnCard({ block, column, index, session, readOnly }: ColumnProps): React.JSX.Element {
  const change = (next: (column: ScoreColumn) => ScoreColumn): void => session.apply((template) =>
    withColumns(template, block.id, (columns) => columns.map((item, at) => (at === index ? next(item) : item))));
  // "A property" holds no field until the author picks one.
  const [chosen, setChosen] = useState<ColumnKind | null>(null);
  const kind = chosen ?? kindOf(column);
  return (
    <div className="atlas-te-column atlas-te-span">
      <TextSetting label="Label" value={column.label ?? ''} session={session} disabled={readOnly} placeholder="Label"
        onText={(text) => change((item) => (text ? { ...item, label: text } : without(item, 'label')))} />
      <SelectSetting<ColumnKind> label="Reads" value={kind} options={KINDS} disabled={readOnly}
        onChange={(next) => {
          setChosen(next === 'formula' ? null : next);
          if (next === 'formula') change(asFormula);
        }} />
      {kind === 'field' && (
        <>
          <FieldSetting value={column.field ?? null} accepts={['pairs']} newType="pairs" session={session} disabled={readOnly}
            onBind={(template, key) => withColumns(template, block.id, (columns) =>
              columns.map((item, at) => (at === index ? { ...item, field: key } : item)))} />
          <TextSetting label="Where it has none" value={column.formula ?? ''} session={session} disabled={readOnly} code
            placeholder="A formula, or leave empty" check={fallbackProblem}
            onText={(text) => change((item) => (text.trim() ? { ...item, formula: text } : without(item, 'formula')))} />
        </>
      )}
      {kind === 'formula' && (
        <TextSetting label="Formula" value={column.formula ?? ''} session={session} disabled={readOnly} code
          check={formulaProblem}
          onText={(text) => change((item) => ({ ...item, formula: text }))} />
      )}
      <ChoiceSetting label="Shows" value={column.display ?? 'plain'} disabled={readOnly}
        options={[{ value: 'plain', label: 'Plain' }, { value: 'signed', label: 'Signed' }]}
        onChange={(display) => change((item) => (display === 'plain' ? without(item, 'display') : { ...item, display }))} />
      <div className="atlas-te-column__remove atlas-te-span">
        <ToolButton icon={X} label="Remove column" isActive={false} disabled={readOnly}
          onClick={() => session.apply((template) => withColumns(template, block.id, (columns) => columns.filter((_, at) => at !== index)))} />
      </div>
    </div>
  );
}

/** A Table's worked-out columns: a formula of each slot's value, or a property's entry for the slot. */
export function ScoreColumns(props: GroupProps & { block: ScoresBlock }): React.JSX.Element {
  const { block, session, readOnly } = props;
  const columns = block.columns ?? [];
  return (
    <>
      {columns.map((column, index) => (
        // Columns have no ids; a column is its place in the list.
        <ColumnCard key={index} {...props} column={column} index={index} />
      ))}
      <Button type="button" variant="ghost" size="sm" className="atlas-te-setting__add atlas-te-span" disabled={readOnly}
        onClick={() => session.apply((template) => withColumns(template, block.id, (current) =>
          [...current, { formula: NEW_COLUMN_FORMULA }]))}>
        <Plus aria-hidden="true" />
        Add column
      </Button>
    </>
  );
}
