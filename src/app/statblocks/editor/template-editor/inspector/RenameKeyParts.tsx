import React, { useId } from 'react';
import { plural } from '../../../../utils/plural';
import type { KeyDependant } from '../../../library/keyDependants';
import type { FieldKey } from '../../../model/templateTypes';
import type { KeyRenameResult } from '../../../notes/keyRename';
import { BatchProgress, Disclosure, LeftNoteRows, NoteRow } from '../../batchParts';

/** A note as the lists name it: its path without ".md". */
const noteName = (path: string): string => path.replace(/\.md$/i, '');

/** The statblocks that use the template, counted, listed on demand. */
export function AffectedNotes({ notes }: { notes: readonly string[] }): React.JSX.Element {
  return (
    <Disclosure label={`Used by ${plural(notes.length, 'statblock')}`}>
      {notes.map((path) => <NoteRow key={path} name={noteName(path)} />)}
    </Disclosure>
  );
}

interface NoteChoiceProps {
  count: number;
  rewrite: boolean;
  onChange: (rewrite: boolean) => void;
}

/** Rewrite the notes now, or let each move its value when it is next edited. */
export function NoteChoice({ count, rewrite, onChange }: NoteChoiceProps): React.JSX.Element {
  const name = useId();
  const now = count === 1 ? 'Rewrite the note now' : `Rewrite the ${count} notes now`;
  return (
    <div className="atlas-te-rename__choices" role="radiogroup" aria-label="When the notes change">
      <label className="atlas-te-rename__option">
        <input type="radio" name={name} checked={rewrite} onChange={() => onChange(true)} />
        <span>{now}</span>
      </label>
      <label className="atlas-te-rename__option">
        <input type="radio" name={name} checked={!rewrite} onChange={() => onChange(false)} />
        <span>Update each note when it is next edited</span>
      </label>
    </div>
  );
}

interface DependantsProps {
  dependants: readonly KeyDependant[];
  update: boolean;
  onChange: (update: boolean) => void;
}

/** "the resource", "the 2 filters", "the 3 resources and filters". */
function dependantsNoun(dependants: readonly KeyDependant[]): string {
  const kinds = new Set(dependants.map((dependant) => dependant.kind));
  if (dependants.length === 1) return `the ${dependants[0]?.kind === 'filter' ? 'filter' : 'resource'}`;
  if (kinds.size > 1) return `the ${dependants.length} resources and filters`;
  return `the ${dependants.length} ${kinds.has('filter') ? 'filters' : 'resources'}`;
}

/** Also update the resources and creature filters that read the key; they are listed on demand. */
export function DependantsChoice({ dependants, update, onChange }: DependantsProps): React.JSX.Element {
  const one = dependants.length === 1;
  const label = `Also update ${dependantsNoun(dependants)} that ${one ? 'uses' : 'use'} it`;
  return (
    <div className="atlas-te-rename__dependants">
      <label className="atlas-te-rename__option">
        <input type="checkbox" checked={update} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
      <Disclosure label={one ? 'Show it' : 'Show them'}>
        {dependants.map((dependant) => (
          <NoteRow
            key={`${dependant.collectionId}/${dependant.kind}/${dependant.name}/${dependant.field}`}
            name={dependant.name}
            detail={<>{dependant.kind === 'filter' ? 'filter' : 'resource'} in {dependant.collectionName}, reads <code>{dependant.field}</code></>}
          />
        ))}
      </Disclosure>
    </div>
  );
}

/** How far the rename has come. */
export function RenameProgress({ done, total }: { done: number; total: number }): React.JSX.Element {
  const text = total === 0 ? 'Updating resources and filters…' : `Rewriting notes: ${done} of ${total}`;
  return <BatchProgress done={done} total={total} label="Rewriting notes" text={text} />;
}

/** What a batch cut short or held up left: how many moved, and the notes that still read the old key. */
export function RenameSummary({ result, problem, from }: { result: KeyRenameResult | null; problem: string | null; from: FieldKey }): React.JSX.Element {
  if (!result) return <p className="atlas-te-setting__problem">{problem ?? 'The notes could not be rewritten.'}</p>;
  const total = result.renamed.length + result.unchanged.length + result.skipped.length + result.notReached.length;
  const left = result.skipped.length + result.notReached.length;
  return (
    <>
      <p className="atlas-te-dialog__text">
        Updated {result.renamed.length + result.unchanged.length} of {plural(total, 'note')}.
        {' '}{left === 1 ? 'One keeps' : `${left} keep`} “{from}” until {left === 1 ? 'it is' : 'they are'} next edited.
      </p>
      <Disclosure label={`Show ${left === 1 ? 'it' : 'them'}`}>
        <LeftNoteRows skipped={result.skipped} notReached={result.notReached} nameOf={noteName} />
      </Disclosure>
    </>
  );
}
