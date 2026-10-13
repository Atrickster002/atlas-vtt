import React, { useState } from 'react';
import type { App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { noteName } from '../../../utils/pathUtils';
import { BY_PATH } from '../../fs/fsLayoutNotes';
import { statblockCount, type LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import type { FsImportReport } from '../../fs/fsLayoutTypes';
import type { TemplateId } from '../../model/templateTypes';
import { plural } from '../../../utils/plural';
import { BatchProgress, Disclosure, LeftNoteRows, NoteRow } from '../batchParts';
import {
  blocksLine, keptScriptsLine, kindLabel, leftoversLabel, moveExplanation, moveLabel, movedLine, replaceQuestion, scriptsLine,
} from './importReportText';
import { replaceTrackScripts } from './layoutImportActions';
import type { StatblockMoveResult } from './statblockMove';
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

/** The statblocks a batch left as they were: those it could not move, with why, and those Cancel kept it from. */
function Leftovers({ result }: { result: StatblockMoveResult }): React.JSX.Element | null {
  const left = result.skipped.length + result.notReached.length;
  if (left === 0) return null;
  return (
    <Disclosure label={leftoversLabel(left)}>
      <LeftNoteRows skipped={result.skipped} notReached={result.notReached} nameOf={noteName} />
    </Disclosure>
  );
}

/** The statblocks by path, each with how its note holds it. */
function StatblockRows({ statblocks }: { statblocks: LayoutStatblocks }): React.JSX.Element {
  const rows = (['frontmatter', 'fences'] as const)
    .flatMap((kind) => statblocks[kind].map((path) => ({ path, kind })))
    .sort((a, b) => BY_PATH.compare(a.path, b.path));
  return <>{rows.map(({ path, kind }) => <NoteRow key={`${kind}:${path}`} name={noteName(path)} detail={kindLabel(kind)} />)}</>;
}

interface AdoptionSectionProps {
  statblocks: LayoutStatblocks;
  phase: AdoptionPhase;
  /** What the template keeps for Fantasy Statblocks' scripts, named once the batch is done. */
  scripts: readonly string[];
  onAdopt: () => void;
}

/** The batch that moves the statblocks (§6.4): the statblocks it moves first, then the batch with its progress, then what it did. */
export function AdoptionSection({ statblocks, phase, scripts, onAdopt }: AdoptionSectionProps): React.JSX.Element {
  const total = statblockCount(statblocks);
  const kept = keptScriptsLine(scripts);
  return (
    <div className="atlas-fs-import__section">
      {phase.kind === 'ready' && (
        <>
          <Disclosure label={`Show the ${plural(total, 'statblock')}`}>
            <StatblockRows statblocks={statblocks} />
          </Disclosure>
          <p className="atlas-te-dialog__text">{moveExplanation(statblocks)}</p>
          <Button type="button" variant="default" size="sm" className="atlas-fs-import__adopt" onClick={onAdopt}>{moveLabel(total)}</Button>
        </>
      )}
      {phase.kind === 'running' && (
        <BatchProgress done={phase.done} total={phase.total} label="Moving statblocks" text={`Moving statblocks: ${phase.done} of ${phase.total}`} />
      )}
      {phase.kind === 'finished' && phase.result && (
        <>
          <p className="atlas-te-dialog__text" role="status">{movedLine(phase.result.moved.length, total)}</p>
          <Leftovers result={phase.result} />
          {kept && <p className="atlas-te-dialog__text">{kept}</p>}
        </>
      )}
      {phase.kind === 'finished' && !phase.result && <p className="atlas-te-setting__problem" role="status">{phase.problem}</p>}
    </div>
  );
}
