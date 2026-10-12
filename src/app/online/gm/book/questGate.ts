import type { BookQuest } from '../../protocol/index.ts';
import { gateSlot } from './gateSlot.ts';

/** Answers which quests players are sent, and says when they may have changed. */
export interface QuestGate {
  /** The quests of the campaign being played as players read them, in the order the book shows them. */
  quests(): Promise<readonly BookQuest[]>;
  /** Calls `listener` whenever the quests may be others; returns what stops it. */
  onChange(listener: () => void): () => void;
}

const NONE: readonly BookQuest[] = [];
const slot = gateSlot<readonly BookQuest[]>(NONE);

/**
 * Names who decides which quests players read: Atlas answers from the quest notes of the campaign
 * being played. A quest's text is the GM's, read from the note; players never write it. Without
 * a gate players are sent no quests.
 */
export function setQuestGate(next: QuestGate | null): void {
  slot.set(next === null ? null : { read: () => next.quests(), onChange: (listener) => next.onChange(listener) });
}

/** The quests players are sent now. */
export const gatedQuests = (): Promise<readonly BookQuest[]> => slot.read();

/** Calls `listener` whenever the quests may be others, also when the gate itself changes. */
export const onQuestsChange = (listener: () => void): (() => void) => slot.onChange(listener);
