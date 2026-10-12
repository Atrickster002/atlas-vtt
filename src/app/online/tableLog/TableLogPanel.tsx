import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from 'react';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { audienceNames, audienceOf, lastWhisperAudience } from './audience.ts';
import { chosenSpeaker } from './chatCommands.ts';
import { Composer } from './Composer.tsx';
import { shownName } from './logAuthors.ts';
import { LogHeader } from './LogHeader.tsx';
import { LogList } from './LogList.tsx';
import type { ChatDraft, RowApi, TableLogPanelProps } from './panelTypes.ts';
import { useLogScroll } from './useLogScroll.ts';
import { useLogUi } from './useLogUi.ts';
import { usePanelDismissal } from './usePanelDismissal.ts';

const OFFLINE_TEXT = 'You cannot write right now.';

/** Whether fingers are the pointer: focusing a field would raise the on-screen keyboard. */
function isCoarse(doc: Document): boolean {
  const told = doc.documentElement.dataset.pointer;
  return told === undefined ? doc.defaultView?.matchMedia('(pointer: coarse)').matches === true : told === 'coarse';
}

/**
 * The table's log: chat, rolls and who came and left, oldest at the top, with the message field
 * under it. It shows what `state` holds and sends what the viewer does through `actions`; nothing
 * changes here before the log says so. Mounted, it counts as open (`state.setOpen`).
 */
export function TableLogPanel(props: TableLogPanelProps): ReactElement {
  const { state, actions, self, moderator, canSend, offlineText, rollFace, speakers, speakerPortrait, imageSrc, openImage, variant, onClose } = props;
  const { entries, refusal, people } = useSyncExternalStore(state.subscribe, state.snapshot);
  const root = useRef<HTMLElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const composerEscape = useRef<(() => boolean) | null>(null);
  const titleId = useId();
  const [ui, act] = useLogUi();
  const [pinned, setPinned] = useState(false);
  const [clearing, setClearing] = useState(false);
  const scroll = useLogScroll(entries, self);
  const floating = variant === 'floating';

  const latest = useRef({ actions, onClose, speakers });
  useEffect(() => {
    latest.current = { actions, onClose, speakers };
  });

  useEffect(() => {
    state.setOpen(true);
    return () => state.setOpen(false);
  }, [state]);

  // Opened with Enter, the next thing a person does is type.
  const typesAtOnce = useRef(canSend);
  useLayoutEffect(() => {
    const element = field.current;
    if (typesAtOnce.current && element !== null && !isCoarse(element.ownerDocument)) element.focus({ preventScroll: true });
  }, []);

  const replied = ui.replyTo === null ? undefined : entries.find((entry) => entry.id === ui.replyTo && (entry.kind === 'chat' || entry.kind === 'roll'));
  const editing = entries.some((entry) => entry.id === ui.editing && entry.kind === 'chat' && entry.who === self) ? ui.editing : null;
  const lastOwn = entries.findLast((entry) => entry.kind === 'chat' && entry.who === self)?.id ?? null;
  const replyAudience = replied === undefined ? null : audienceOf(replied, self);

  const { center } = scroll;
  const api = useMemo<RowApi>(() => {
    const toField = (): void => field.current?.focus({ preventScroll: true });
    return {
      self,
      moderator,
      canSend,
      react: (id, emoji, on) => latest.current.actions.react(id, emoji, on),
      roll: (draft) => {
        const speaker = chosenSpeaker(latest.current.speakers, state.choices().speaker);
        latest.current.actions.roll(speaker?.kind === 'token' ? { ...draft, speaker: speaker.key } : draft);
      },
      reply: (id) => {
        act.reply(id);
        toField();
      },
      edit: (id) => act.edit(id),
      saveEdit: (id, text) => {
        latest.current.actions.edit(id, text);
        act.edit(null);
        toField();
      },
      cancelEdit: () => {
        act.edit(null);
        toField();
      },
      askDelete: (id) => act.ask(id),
      remove: (id) => {
        act.ask(null);
        latest.current.actions.remove(id);
      },
      tap: (id) => act.tap(id),
      jumpTo: (id) => {
        if (center(id)) act.highlight(id);
      },
    };
  }, [self, moderator, canSend, state, act, center]);

  const editLast = useCallback((): boolean => {
    if (lastOwn === null) return false;
    act.edit(lastOwn);
    return true;
  }, [act, lastOwn]);

  /** What Escape undoes, innermost first; false where the panel has no use for the key. */
  const escape = useCallback((): boolean => {
    if (composerEscape.current?.() === true) return true;
    if (editing !== null) api.cancelEdit();
    else if (ui.asking !== null || clearing) {
      act.ask(null);
      setClearing(false);
    } else if (replied !== undefined) act.reply(null);
    else if (state.choices().whisperTo !== null) state.setWhisperTo(null);
    else if (floating && !pinned) latest.current.onClose();
    else return false;
    return true;
  }, [editing, ui.asking, clearing, replied, state, floating, pinned, api, act]);

  const close = useCallback((): void => latest.current.onClose(), []);
  usePanelDismissal(root, floating && !pinned, escape, close);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      if (escape()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // A sheet around the panel closes on the Escape the panel has no use for.
      if (!floating) return;
    }
    // Keys typed in the panel never reach the map's shortcuts behind it.
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
  };

  const say = useCallback((draft: ChatDraft): void => {
    latest.current.actions.say(draft);
    act.reply(null);
    act.tap(null);
  }, [act]);

  const clear = actions.clear === undefined ? undefined : (): void => {
    setClearing(false);
    latest.current.actions.clear?.();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <section ref={root} className={`atlas-vtt-plugin atlas-online-log atlas-online-log--${variant}`} aria-labelledby={floating ? titleId : undefined} onKeyDown={onKeyDown}>
        {floating && <LogHeader titleId={titleId} pinned={pinned} asking={clearing} onClear={clear} onAsk={setClearing} onPin={setPinned} onClose={close} />}
        <LogList entries={entries} ui={{ ...ui, editing }} api={api} scroll={scroll} rollFace={rollFace} speakerPortrait={speakerPortrait} people={people} imageSrc={imageSrc} openImage={openImage} onTabStop={act.tabStop} />
        <Composer
          field={field} state={state} self={self} people={people} speakers={speakers} canSend={canSend} offlineText={offlineText ?? OFFLINE_TEXT}
          refusal={refusal} lastOwn={lastOwn} lastWhisper={lastWhisperAudience(entries, self)} escapeRef={composerEscape}
          reply={replied === undefined ? null : {
            id: replied.id,
            label: replied.who === self ? 'Replying to yourself' : `Replying to ${shownName(replied.who, replied.name, self)}`,
            whisper: replyAudience === null || replyAudience.length === 0 ? null : `Whispering to ${audienceNames(replyAudience, people, self)}`,
          }}
          onClearReply={() => act.reply(null)} onSay={say} onRoll={(draft) => latest.current.actions.roll(draft)} onEditLast={editLast}
        />
      </section>
    </TooltipProvider>
  );
}
