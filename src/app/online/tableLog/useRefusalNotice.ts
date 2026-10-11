import type { ChatRefusal } from '../protocol/index.ts';
import { useEffect, useRef, useState } from 'react';
import type { LogView } from './LogState.ts';

/** How long a refusal stays above the message field. */
export const NOTICE_MS = 4000;

const REFUSALS: Readonly<Record<ChatRefusal, string>> = {
  rate: 'You are sending too fast. Wait a moment.',
  text: 'That message cannot be sent.',
  gone: 'That message is gone.',
};

/**
 * The line a refusal shows for a moment: each refusal anew, the same reason twice too. `onRefused`
 * hears of each as it arrives; none for a refusal that was there before the panel opened.
 */
export function useRefusalNotice(refusal: LogView['refusal'], onRefused: (reason: ChatRefusal) => void): string | null {
  const seen = useRef(refusal?.n ?? 0);
  const heard = useRef(onRefused);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    heard.current = onRefused;
  });

  useEffect(() => {
    if (refusal === null || refusal.n === seen.current) return undefined;
    seen.current = refusal.n;
    setNotice(REFUSALS[refusal.reason]);
    heard.current(refusal.reason);
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [refusal]);

  return notice;
}
