import React, { useState } from 'react';
import type { App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { noteName } from '../../../utils/pathUtils';
import type { FsImportReport } from '../../fs/fsLayoutTypes';
import type { TemplateId } from '../../model/templateTypes';
import type { TemplateSwitchResult } from '../../notes/templateSwitch';
import { plural } from '../../../utils/plural';
import { BatchProgress, Disclosure, LeftNoteRows, NoteRow } from '../batchParts';
import { adoptedLine, blocksLine, replaceQuestion, scriptsLine } from './importReportText';
import { replaceTrackScripts } from './layoutImportActions';
import type { AdoptionPhase } from './useLayoutAdoption';

type Replacing = 'ready' | 'running' | 'done' | 'failed';

/** What the import made: blocks, scripts kept, and what was left out or shown in part; Track blocks offered for tracks. */
export function ImportSummary({ app, templateId, report }: { app: App; templateId: TemplateId; report: FsImportReport }): React.JSX.Element {
  const [replacing, setReplacing] = useState<Replacing>('ready');
  const scripts = scriptsLine(report);
  const question = replaceQuestion(report);

  const replace = (): void => {
    setReplacing('running');
    replaceTrackScripts(app, templateId).then(
      (replaced) => setReplacing(replaced ? 'done' : 'failed'),
      (error: unknown) => {
        console.error('[Atlas] Replacing scripts with Track blocks failed:', error);
        setReplacing('failed');
      },
    );
  };

  return (
    <div className="atlas-fs-import__section">
      <p className="atlas-te-dialog__text">{blocksLine(report)}{scripts && ` ${scripts}`}</p>
      {question && replacing !== 'done' && (
        <div className="atlas-fs-import__row">
          <span className="atlas-fs-import__question">{question}</span>
          <Button type="button" variant="outline" size="sm" disabled={replacing === 'running'} onClick={replace}>Replace with Track blocks</Button>
        </div>
      )}
      {replacing === 'done' && <p className="atlas-te-dialog__text" role="status">Replaced with Track blocks.</p>}
      {replacing === 'failed' && <p className="atlas-te-setting__problem" role="status">Couldn&apos;t replace the scripts.</p>}
      {report.dropped.length > 0 && (
        <Disclosure label={`Not carried over (${report.dropped.length})`}>
          {report.dropped.map((sentence) => <li key={sentence}>{sentence}</li>)}
        </Disclosure>
      )}
      {report.partial.length > 0 && (
        <Disclosure label={`Shown in part (${report.partial.length})`}>
          {report.partial.map((sentence) => <li key={sentence}>{sentence}</li>)}
        </Disclosure>
      )}
    </div>
  );
}

/** The notes left as they were by a batch: those that changed meanwhile, and those Cancel kept it from. */
function Leftovers({ result }: { result: TemplateSwitchResult }): React.JSX.Element | null {
  const left = result.skipped.length + result.notReached.length;
  if (left === 0) return null;
  return (
    <Disclosure label={left === 1 ? 'Show the note left as it was' : `Show the ${left} notes left as they were`}>
      <LeftNoteRows skipped={result.skipped} notReached={result.notReached} nameOf={noteName} />
    </Disclosure>
  );
}

interface AdoptionSectionProps {
  notes: readonly string[];
  /** "Use Marsh creature for the 214 notes using layout Basic 5e". */
  label: string;
  phase: AdoptionPhase;
  onAdopt: () => void;
}

/** The adoption batch (§6.4): the notes it changes first, then the batch with its progress, then what it did. */
export function AdoptionSection({ notes, label, phase, onAdopt }: AdoptionSectionProps): React.JSX.Element {
  return (
    <div className="atlas-fs-import__section">
      {phase.kind === 'ready' && (
        <>
          <Disclosure label={`Show the ${plural(notes.length, 'note')}`}>
            {notes.map((path) => <NoteRow key={path} name={noteName(path)} />)}
          </Disclosure>
          <p className="atlas-te-dialog__text">Their values and their layout stay; Fantasy Statblocks draws them as before.</p>
          <Button type="button" variant="default" size="sm" className="atlas-fs-import__adopt" onClick={onAdopt}>{label}</Button>
        </>
      )}
      {phase.kind === 'running' && (
        <BatchProgress done={phase.done} total={phase.total} label="Switching notes" text={`Switching notes: ${phase.done} of ${phase.total}`} />
      )}
      {phase.kind === 'finished' && phase.result && (
        <>
          <p className="atlas-te-dialog__text" role="status">{adoptedLine(phase.result.switched.length, notes.length)}</p>
          <Leftovers result={phase.result} />
        </>
      )}
      {phase.kind === 'finished' && !phase.result && <p className="atlas-te-setting__problem" role="status">{phase.problem}</p>}
    </div>
  );
}
