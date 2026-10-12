import { LOG_REACTIONS, MAX_PLAYERS, type LogReaction, type LogReactionEmoji } from '../../protocol/index.ts';

/** The most who a reaction names: everyone a table seats and the GM. Past that the earliest gives way (someone who joined anew under another id). */
const MAX_REACTORS = MAX_PLAYERS + 1;

/** The reactions with `who`'s `emoji` given or taken back, in the order reactions are offered; null when nothing changes. */
export function withReaction(reactions: readonly LogReaction[], emoji: LogReactionEmoji, who: string, on: boolean): readonly LogReaction[] | null {
  const current = reactions.find((reaction) => reaction.emoji === emoji);
  if ((current?.by.includes(who) ?? false) === on) return null;
  const by = on ? [...(current?.by ?? []), who].slice(-MAX_REACTORS) : (current?.by ?? []).filter((other) => other !== who);
  const others = reactions.filter((reaction) => reaction.emoji !== emoji);
  const next = by.length === 0 ? others : [...others, { emoji, by }];
  return [...next].sort((a, b) => LOG_REACTIONS.indexOf(a.emoji) - LOG_REACTIONS.indexOf(b.emoji));
}
