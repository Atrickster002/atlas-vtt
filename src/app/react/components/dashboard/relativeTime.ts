import { getLocale, t } from '../../../i18n';
import type { MessageKey } from '../../../i18n/types';

/** The sentence for each step of a relative time; the counted ones take `{count}`. */
export interface RelativeTimePhrases {
  justNow: MessageKey;
  minutes: MessageKey;
  hours: MessageKey;
  days: MessageKey;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const AGO: RelativeTimePhrases = {
  justNow: 'dashboard.justNow',
  minutes: 'dashboard.minutesAgo',
  hours: 'dashboard.hoursAgo',
  days: 'dashboard.daysAgo',
};

/** How long ago `timestamp` was, in the dashboard's short style ("3h ago"). */
export function formatRelativeTime(timestamp: number, phrases: RelativeTimePhrases = AGO, now: number = Date.now()): string {
  const diff = now - timestamp;
  if (diff < MINUTE) return t(phrases.justNow);
  if (diff < HOUR) return t(phrases.minutes, { count: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t(phrases.hours, { count: Math.floor(diff / HOUR) });
  return t(phrases.days, { count: Math.floor(diff / DAY) });
}

/** A day written `YYYY-MM-DD`, shown as the language writes a short date ("Oct 18"). */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const local = new Date(year!, month! - 1, date);
  const sameYear = local.getFullYear() === new Date().getFullYear();
  return local.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', ...(!sameYear && { year: 'numeric' }) });
}
