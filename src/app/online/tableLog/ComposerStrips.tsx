import { Lock, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';

export interface StripProps {
  readonly text: string;
  /** A second line: whom a reply is whispered to. */
  readonly whisper?: string | null;
  readonly locked?: boolean;
  readonly clearLabel: string;
  readonly onClear: () => void;
}

/** A strip on top of the message field: what the next message answers, or whom every message is whispered to. */
export function ComposerStrip({ text, whisper, locked, clearLabel, onClear }: StripProps): ReactElement {
  return (
    <div className={locked === true ? 'atlas-online-log__strip atlas-online-log__strip--whisper' : 'atlas-online-log__strip'}>
      {locked === true && <Lock className="atlas-online-log__strip-icon" />}
      <span className="atlas-online-log__strip-lines">
        <span className="atlas-online-log__strip-text">{text}</span>
        {whisper !== undefined && whisper !== null && (
          <span className="atlas-online-log__strip-text atlas-online-log__strip-whisper">
            <Lock />
            {whisper}
          </span>
        )}
      </span>
      <LabelTooltip label={clearLabel}>
        <button type="button" className="atlas-online-log__strip-clear" onClick={onClear}><X /></button>
      </LabelTooltip>
    </div>
  );
}
