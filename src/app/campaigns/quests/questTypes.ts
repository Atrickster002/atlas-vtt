/**
 * A quest is a Markdown note of the vault whose frontmatter says `atlas-type: quest` and names its
 * campaign in `campaign`. The GM writes its text in Obsidian like any note; the other fields are
 * frontmatter properties of that note.
 */

/** The frontmatter properties of a quest note, as the GM sees them in Obsidian. */
export const QUEST_PROPERTY = {
  type: 'atlas-type',
  /** The campaign's name (Atlas writes it anew when the campaign is renamed); its id is read too. */
  campaign: 'campaign',
  kind: 'kind',
  status: 'status',
  experience: 'experience',
  rewards: 'rewards',
  place: 'place',
  /** Never changed once written: players' notes on a quest name it by this. */
  id: 'atlas-id',
} as const;

/** What `atlas-type` says of a quest note. */
export const QUEST_TYPE = 'quest';

/** A main quest leads, a side quest waits beside it. */
export const QUEST_KINDS = ['main', 'side'] as const;
export type QuestKind = (typeof QUEST_KINDS)[number];

/** How far a quest has got: told, taken up, done, or failed. The last two are behind the party. */
export const QUEST_STATUSES = ['open', 'active', 'done', 'failed'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];

/** A point on the campaign's world map: shares 0..1 of its image's width and height. */
export interface QuestPlace {
  readonly x: number;
  readonly y: number;
}

/** A quest note as Atlas reads its frontmatter. What could not be read is unset, never guessed. */
export interface Quest {
  readonly path: string;
  /** The note's name. */
  readonly title: string;
  /** The campaign as the note names it, trimmed. */
  readonly campaign: string;
  /** The quest's stable id, once Atlas gave it one. */
  readonly id?: string;
  readonly kind?: QuestKind;
  /** Open where the note names none Atlas knows. */
  readonly status: QuestStatus;
  readonly experience?: number;
  readonly rewards: readonly string[];
  readonly place?: QuestPlace;
  /** When the note was made and last written (milliseconds since the epoch), as the vault says. */
  readonly created: number;
  readonly modified: number;
}

/** Whether a quest is behind the party: done or failed. */
export const isQuestOver = (quest: Pick<Quest, 'status'>): boolean => quest.status === 'done' || quest.status === 'failed';
