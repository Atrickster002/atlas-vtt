import type { RollEntry } from '../protocol/index.ts';
import { ArrowDown, MessagesSquare } from 'lucide-react';
import { useEffect, useState, type FocusEvent, type KeyboardEvent, type ReactElement } from 'react';
import { ChatRow } from './ChatRow.tsx';
import { classes } from './classes.ts';
import { continuesPrevious, shownName } from './logAuthors.ts';
import type { ShownEntry } from './LogState.ts';
import { dayLabel, relativeTime, sameDay } from './logTime.ts';
import type { RollFace, RowApi } from './panelTypes.ts';
import { RollRow } from './RollRow.tsx';
import type { LogScroll } from './useLogScroll.ts';
import type { LogUi } from './useLogUi.ts';

/** How often the rows' "5m ago" is read again. */
const CLOCK_MS = 30_000;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export interface LogListProps {
  readonly entries: readonly ShownEntry[];
  readonly ui: LogUi;
  readonly api: RowApi;
  readonly scroll: LogScroll;
  readonly rollFace: ((entry: RollEntry) => RollFace | null) | undefined;
  readonly onTabStop: (id: string) => void;
}

const hasTools = (entry: ShownEntry): boolean => entry.kind === 'chat' || entry.kind === 'roll';

/** The way down, over the list's lower edge: what arrived below, or just the way where nothing did. */
function JumpPill({ scroll }: { readonly scroll: LogScroll }): ReactElement {
  const label = scroll.pending === 0 ? 'Jump to latest' : scroll.pending === 1 ? '1 new message' : `${scroll.pending} new messages`;
  return (
    <button type="button" className={classes('atlas-online-log__jump', scroll.away && 'is-visible')} inert={!scroll.away} onClick={scroll.jump}>
      {label}
      <ArrowDown />
    </button>
  );
}

/**
 * The log, oldest at the top: chat messages (those of one author close together as one block),
 * rolls, lines about who came and left, and a line between two days. The Tab key reaches one row;
 * the arrow keys move between rows.
 */
export function LogList({ entries, ui, api, scroll, rollFace, onTabStop }: LogListProps): ReactElement {
  const now = useNow();
  const rows = entries.filter(hasTools);
  const tabStop = rows.find((entry) => entry.id === ui.tabStop)?.id ?? rows.at(-1)?.id ?? null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const row = event.target as HTMLElement;
    if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || row.dataset.entry === undefined) return;
    const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-entry]'));
    const next = all[all.indexOf(row) + (event.key === 'ArrowUp' ? -1 : 1)];
    if (next === undefined) return;
    event.preventDefault();
    next.focus();
  };
  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-entry]')?.dataset.entry;
    if (id !== undefined) onTabStop(id);
  };

  return (
    <div className="atlas-online-log__body">
      <div ref={scroll.listRef} className="atlas-online-log__list" tabIndex={-1} onScroll={scroll.onScroll}>
        {entries.length === 0 && (
          <div className="atlas-online-log__empty">
            <MessagesSquare />
            <span>Nothing yet. Say hello, or roll some dice.</span>
          </div>
        )}
        <div ref={scroll.rowsRef} className="atlas-online-log__rows" role="log" onKeyDown={onKeyDown} onFocus={onFocus}>
          {entries.map((entry, index) => {
            const before = entries[index - 1];
            const newDay = before === undefined || !sameDay(before.at, entry.at);
            const time = relativeTime(entry.at, now);
            const flags = { asking: ui.asking === entry.id, tapped: ui.tapped === entry.id, highlighted: ui.highlighted === entry.id, tabStop: tabStop === entry.id };
            return (
              <div key={entry.id} className="atlas-online-log__item">
                {newDay && <div className="atlas-online-log__day" role="separator"><span>{dayLabel(entry.at, now)}</span></div>}
                {entry.kind === 'chat' && <ChatRow entry={entry} continued={!newDay && continuesPrevious(before, entry)} time={time} api={api} editing={ui.editing === entry.id} {...flags} />}
                {entry.kind === 'roll' && <RollRow entry={entry} face={rollFace?.(entry) ?? null} time={time} api={api} {...flags} />}
                {(entry.kind === 'joined' || entry.kind === 'left') && (
                  <div className="atlas-online-log__presence">
                    {entry.kind === 'joined' ? `${shownName(entry.who, entry.name, api.self)} joined the table` : `${shownName(entry.who, entry.name, api.self)} left the table`}
                    <span className="atlas-online-log__time">{time}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <JumpPill scroll={scroll} />
    </div>
  );
}
