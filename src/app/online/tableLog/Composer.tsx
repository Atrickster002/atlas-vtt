import { MAX_CHAT_TEXT, type ChatRefusal } from '../protocol/index.ts';
import { ArrowUp, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type RefObject } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { classes } from './classes.ts';
import { isComposing, useGrowingField } from './growField.ts';
import type { LogState, LogView } from './LogState.ts';
import { useRefusalNotice } from './useRefusalNotice.ts';

/** From this many characters left, the field says how many. */
const COUNTER_FROM = 50;

export interface ComposerProps {
  readonly field: RefObject<HTMLTextAreaElement | null>;
  /** Keeps what is typed and not sent while the panel is closed. */
  readonly drafts: Pick<LogState, 'draft' | 'keepDraft'>;
  readonly canSend: boolean;
  readonly offlineText: string;
  readonly refusal: LogView['refusal'];
  /** The entry the next message answers, and how the strip above the field names it. */
  readonly reply: { readonly id: string; readonly label: string } | null;
  /** The viewer's newest chat message in the log: tells whether what was sent last has arrived. */
  readonly lastOwn: string | null;
  readonly onClearReply: () => void;
  readonly onSay: (text: string, reply?: string) => void;
  /** Opens the viewer's newest message for editing; false where there is none. */
  readonly onEditLast: () => boolean;
}

/**
 * The message field under the list: Enter sends, Shift+Enter breaks the line, and it grows to five
 * lines. A reply shows as a strip on top. A refusal shows for a moment above it; a message refused
 * for its pace is put back into the empty field.
 */
export function Composer({ field, drafts, canSend, offlineText, refusal, reply, lastOwn, onClearReply, onSay, onEditLast }: ComposerProps): ReactElement {
  const name = useId();
  const [draft, setDraft] = useState(() => drafts.draft);
  useEffect(() => drafts.keepDraft(draft), [drafts, draft]);
  const sent = useRef<{ readonly text: string; readonly lastOwn: string | null } | null>(null);
  useGrowingField(field, draft);

  const onRefused = useCallback((reason: ChatRefusal): void => {
    const last = sent.current;
    sent.current = null;
    // Only a message that has not arrived was the one refused: a reaction or an edit may be refused for its pace as well.
    if (reason === 'rate' && last !== null && last.lastOwn === lastOwn) setDraft((now) => (now === '' ? last.text : now));
  }, [lastOwn]);
  const notice = useRefusalNotice(refusal, onRefused);

  const text = draft.trim();
  const sendable = canSend && text !== '';
  const left = MAX_CHAT_TEXT - draft.length;

  const send = (): void => {
    if (!sendable) return;
    if (reply === null) onSay(text);
    else onSay(text, reply.id);
    sent.current = { text, lastOwn };
    setDraft('');
    field.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (isComposing(event)) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    } else if (event.key === 'ArrowUp' && draft === '' && onEditLast()) event.preventDefault();
  };

  const line = notice ?? (canSend ? null : offlineText);
  return (
    <div className="atlas-online-log__composer">
      {line !== null && <div className={classes('atlas-online-log__notice', notice !== null && 'atlas-online-log__notice--refused')} role="status">{line}</div>}
      <div className={classes('atlas-online-log__composer-box', !canSend && 'is-disabled')}>
        {reply !== null && (
          <div className="atlas-online-log__strip">
            <span className="atlas-online-log__strip-text">{reply.label}</span>
            <LabelTooltip label="Cancel reply">
              <button type="button" className="atlas-online-log__strip-clear" onClick={onClearReply}><X /></button>
            </LabelTooltip>
          </div>
        )}
        <div className="atlas-online-log__field">
          <label className="atlas-online-log__sr" htmlFor={name}>Message</label>
          <textarea
            ref={field} id={name} className="atlas-online-log__input" rows={1} maxLength={MAX_CHAT_TEXT} placeholder="Message the table"
            disabled={!canSend} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown}
          />
          {left <= COUNTER_FROM && <span className="atlas-online-log__counter">{left}</span>}
          <LabelTooltip label="Send">
            <button type="button" className="atlas-online-log__send" disabled={!sendable} onClick={send}><ArrowUp /></button>
          </LabelTooltip>
        </div>
      </div>
    </div>
  );
}
