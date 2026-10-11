import type { ChatEntry } from '../protocol/index.ts';
import { memo, type ReactElement } from 'react';
import { AuthorDisc, toneClass } from './AuthorDisc.tsx';
import { EditField } from './EditField.tsx';
import { reactionsFor, shownName } from './logAuthors.ts';
import type { RowApi, RowFlags } from './panelTypes.ts';
import { ReactionChips } from './ReactionChips.tsx';
import { ReplyQuote } from './ReplyQuote.tsx';
import { RowShell } from './RowShell.tsx';

export interface ChatRowProps extends RowFlags {
  readonly entry: ChatEntry;
  /** Continues the row above: no avatar, no byline. */
  readonly continued: boolean;
  /** How long ago it was said, in words. */
  readonly time: string;
  readonly api: RowApi;
}

/** A chat message: who said it and when, what it answers, its text as text, and its reactions. */
export const ChatRow = memo(function ChatRow({ entry, continued, time, api, ...flags }: ChatRowProps): ReactElement {
  const { id, who, name, text, reply } = entry;
  const own = api.self !== null && who === api.self;
  const reactions = reactionsFor(entry, api.self);
  return (
    <RowShell id={id} className={continued ? 'atlas-online-log__row--continued' : 'atlas-online-log__row--chat'} reactions={reactions} canEdit={own} canDelete={own || api.moderator} api={api} {...flags}>
      {reply !== undefined && <ReplyQuote reply={reply} self={api.self} onOpen={() => api.jumpTo(reply.id)} />}
      <div className="atlas-online-log__message">
        {continued ? <span className="atlas-online-log__gutter" aria-hidden="true" /> : <AuthorDisc who={who} name={name} size="row" />}
        <div className="atlas-online-log__content">
          {!continued && (
            <div className="atlas-online-log__byline">
              <span className={`atlas-online-log__name ${toneClass(who)}`}>{shownName(who, name, api.self)}</span>
              <span className="atlas-online-log__time">{time}</span>
            </div>
          )}
          {flags.editing ? (
            <EditField text={text} onSave={(next) => api.saveEdit(id, next)} onCancel={api.cancelEdit} />
          ) : (
            <div className="atlas-online-log__text">
              {text}
              {entry.edited !== undefined && <span className="atlas-online-log__edited"> (edited)</span>}
            </div>
          )}
          <ReactionChips id={id} reactions={reactions} api={api} />
        </div>
      </div>
    </RowShell>
  );
});
