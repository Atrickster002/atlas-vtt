import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { tablesOfNote } from '../../../randomTables/noteTables';
import { readPastedTable, type PastedTable } from '../../../randomTables/pastedTable';
import { tableNoteText } from '../../../randomTables/tableMarkdown';
import { guessTableKind } from '../../../randomTables/tableKind';
import type { RandomTable } from '../../../randomTables/tableModel';
import type { RandomTableKind } from '../../../types/randomTableTypes';
import { TablePreview } from './TablePreview';
import { t } from '../../../i18n';

const KINDS = [
  { value: 'text', label: t('tables.kind.text') },
  { value: 'items', label: t('tables.kind.items') },
] as const;

/** What the dialog saves: the table as pasted, its name and what it gives. */
export interface PastedTableNote {
  name: string;
  kind: RandomTableKind;
  table: PastedTable;
}

interface PasteTableDialogProps {
  /** The folder the note is written to, as the footer names it. */
  folder: string;
  onSave: (note: PastedTableNote) => void;
  onClose: () => void;
}

/** The paste read as a table and as the note will read it back, or null while it holds no rows. */
function usePreview(text: string, name: string): { pasted: PastedTable; table: RandomTable } | null {
  return useMemo(() => {
    const pasted = readPastedTable(text, { resultHeader: t('tables.paste.resultColumn'), rollHeader: t('tables.paste.rollColumn') });
    if (!pasted || pasted.rows.length === 0) return null;
    const title = name.trim() || t('tables.paste.untitled');
    const table = tablesOfNote(tableNoteText(title, pasted), title).tables[0];
    return table ? { pasted, table } : null;
  }, [text, name]);
}

/**
 * New table: pasted text (a PDF's lines, a spreadsheet's rows, a Markdown table) shown as the
 * table it will be, read only, with what is wrong with it; Save writes it as a new note. No row,
 * cell or range is edited here: what the preview finds wrong is fixed in the text or the note.
 */
export function PasteTableDialog({ folder, onSave, onClose }: PasteTableDialogProps): React.ReactElement {
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [chosenKind, setChosenKind] = useState<RandomTableKind | null>(null);
  const preview = usePreview(text, name);
  const kind = chosenKind ?? (preview ? guessTableKind(preview.table.columns) : 'text');
  const canSave = name.trim() !== '' && preview !== null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !handledByAnotherControl(event)) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <motion.div {...dialogOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-paste-table-overlay" onMouseDown={(e) => e.stopPropagation()}>
      <div className="atlas-paste-table__backdrop" onClick={onClose} />
      <motion.div className="atlas-paste-table" variants={windowVariants} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="atlas-paste-table__header">
          <h3 id={titleId}>{t('tables.newTable')}</h3>
          <CloseButton onClick={onClose} aria-label={t('common.cancel')} />
        </header>
        <div className="atlas-paste-table__body">
          <div className="atlas-paste-table__input">
            <div className="atlas-paste-table__row">
              <input
                type="text"
                className="atlas-csm-input"
                value={name}
                placeholder={t('tables.paste.name')}
                aria-label={t('tables.paste.name')}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
              <SegmentedControl<RandomTableKind> value={kind} options={KINDS} ariaLabel={t('tables.paste.kind')} onChange={setChosenKind} />
            </div>
            <textarea
              className="atlas-paste-table__text"
              value={text}
              aria-label={t('tables.paste.text')}
              placeholder={t('tables.paste.hint')}
              spellCheck={false}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div className="atlas-paste-table__preview" aria-live="polite">
            {preview ? <TablePreview table={preview.table} /> : <p className="atlas-paste-table__empty">{t('tables.paste.empty')}</p>}
          </div>
        </div>
        <footer className="atlas-paste-table__footer">
          <span className="atlas-paste-table__folder">{t('tables.paste.savedIn', { folder })}</span>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="default"
            disabled={!canSave}
            onClick={() => { if (preview) onSave({ name: name.trim(), kind, table: preview.pasted }); }}
          >
            {t('tables.paste.save')}
          </Button>
        </footer>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
