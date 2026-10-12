import type { App } from 'obsidian';
import { CampaignFiles, type CampaignStorage } from '../campaigns/CampaignFiles';
import { CampaignPlay } from '../campaigns/campaignPlay';
import { CampaignService } from '../campaigns/CampaignService';
import { onPlayedCampaignChange } from '../campaigns/playedCampaign';
import { QuestIds } from '../campaigns/quests/questIds';
import { QuestIndex } from '../campaigns/quests/QuestIndex';
import { readQuestBody } from '../campaigns/quests/questText';
import type { Quest } from '../campaigns/quests/questTypes';
import type { BookQuest } from '../online/protocol/index.ts';
import { bookQuestOf, bookQuestOrder } from '../online/gm/book/bookQuests.ts';
import type { QuestGate } from '../online/gm/book/questGate.ts';

/** A quest as it was last handed on: kept while its note's reading (the same object) and its id stay. */
interface HandedQuest {
  readonly quest: Quest;
  readonly id: string;
  readonly book: BookQuest | null;
}

const sameList = (a: readonly BookQuest[], b: readonly BookQuest[]): boolean => a.length === b.length && a.every((quest, n) => quest === b[n]);

/**
 * The quests players read are the quest notes of the campaign this device plays: none while it
 * plays none. They may be others whenever another campaign (or none) is played, a campaign changes,
 * or a quest note is written, added, moved or deleted. A note is given its id the first time it is
 * handed on, should it have none. Only notes that changed are read again, and the answer is the
 * same array while no quest changed, so books compare it by identity.
 */
export function campaignQuestGate(
  app: App,
  play: () => CampaignPlay = () => CampaignPlay.forApp(app),
  storage: () => CampaignStorage | undefined = () => CampaignFiles.forApp(app),
  index: () => QuestIndex | undefined = () => QuestIndex.forApp(app),
): QuestGate {
  const ids = new QuestIds(app);
  const handed = new Map<string, HandedQuest>();
  let last: readonly BookQuest[] = [];

  const bookOf = async (quest: Quest, id: string | undefined): Promise<BookQuest | null> => {
    if (id === undefined) return null;
    const known = handed.get(quest.path);
    if (known !== undefined && known.quest === quest && known.id === id) return known.book;
    const body = await readQuestBody(app, quest.path).catch(() => null);
    const book = body === null ? null : bookQuestOf(quest, id, body);
    handed.set(quest.path, { quest, id, book });
    return book;
  };

  const read = async (): Promise<readonly BookQuest[]> => {
    const campaigns = storage();
    const quests = index();
    const playing = play().playing();
    const list = campaigns === undefined ? [] : new CampaignService(campaigns).list();
    const campaign = playing === null ? undefined : list.find((entry) => entry.id === playing);
    if (campaign === undefined || quests === undefined) return [];
    const shown = bookQuestOrder(quests.of(campaign, list));
    const idOf = await ids.idsOf(quests.all(), shown);
    const books = await Promise.all(shown.map((quest) => bookOf(quest, idOf.get(quest.path))));
    const paths = new Set(shown.map((quest) => quest.path));
    for (const path of [...handed.keys()]) if (!paths.has(path)) handed.delete(path);
    // Each id once: a book with an id twice would not be read.
    const kept = new Map<string, BookQuest>();
    for (const book of books) if (book !== null && !kept.has(book.id)) kept.set(book.id, book);
    return [...kept.values()];
  };

  return {
    quests: async (): Promise<readonly BookQuest[]> => {
      const next = await read();
      if (!sameList(next, last)) last = next;
      return last;
    },
    onChange: (listener) => {
      const stops = [onPlayedCampaignChange(app, listener, play, storage), index()?.onChange(listener) ?? ((): void => undefined)];
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
