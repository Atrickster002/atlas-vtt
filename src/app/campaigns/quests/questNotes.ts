import { TFile, type App } from 'obsidian';
import { ensureFolder, isPathTaken } from '../../plugin/vaultFolders';
import { freeNamedPath, nameStem } from '../../services/recordFiles/recordNames';
import { randomHex } from '../../utils/randomHex';
import { QUEST_ID } from './questProperties';
import { QUEST_PROPERTY, QUEST_TYPE, type QuestKind, type QuestPlace, type QuestStatus } from './questTypes';

/** The folder of a campaign's quests Atlas creates, inside the campaign's own folder. */
export const QUESTS_FOLDER = 'quests';
const FALLBACK_TITLE = 'Quest';
/** Places are kept to this many decimals: a ten-thousandth of the map is finer than any pin. */
const PLACE_DECIMALS = 4;

type Frontmatter = Record<string, unknown>;

/** A new quest id: 96 random bits in hex, from the cryptographic source. */
export const newQuestId = (): string => randomHex(12);

/** Changes a note's frontmatter with Obsidian's own YAML writer; false when the note is gone. */
async function changeFrontmatter(app: App, path: string, change: (frontmatter: Frontmatter) => void): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return false;
  await app.fileManager.processFrontMatter(file, change);
  return true;
}

/**
 * Creates a quest note of the campaign in `folder`/quests, named after `title`, with its
 * properties set (an id among them), and returns it.
 */
export async function createQuestNote(app: App, folder: string, campaignName: string, title: string, kind: QuestKind): Promise<TFile> {
  const questsFolder = await ensureFolder(app, `${folder}/${QUESTS_FOLDER}`);
  const path = freeNamedPath(questsFolder.path, nameStem(title, FALLBACK_TITLE), '.md', (candidate) => isPathTaken(app, candidate));
  const file = await app.vault.create(path, '');
  await app.fileManager.processFrontMatter(file, (frontmatter: Frontmatter) => {
    frontmatter[QUEST_PROPERTY.type] = QUEST_TYPE;
    frontmatter[QUEST_PROPERTY.campaign] = campaignName;
    frontmatter[QUEST_PROPERTY.kind] = kind;
    frontmatter[QUEST_PROPERTY.status] = 'open';
    frontmatter[QUEST_PROPERTY.id] = newQuestId();
  });
  return file;
}

export function setQuestStatus(app: App, path: string, status: QuestStatus): Promise<boolean> {
  return changeFrontmatter(app, path, (frontmatter) => { frontmatter[QUEST_PROPERTY.status] = status; });
}

/** Sets where the quest leads on the campaign's world map, or takes the place away (null). */
export function setQuestPlace(app: App, path: string, place: QuestPlace | null): Promise<boolean> {
  const round = (share: number): number => Number(Math.min(1, Math.max(0, share)).toFixed(PLACE_DECIMALS));
  return changeFrontmatter(app, path, (frontmatter) => {
    if (place === null) delete frontmatter[QUEST_PROPERTY.place];
    else frontmatter[QUEST_PROPERTY.place] = { x: round(place.x), y: round(place.y) };
  });
}

/**
 * Gives the quest note `id` unless it holds a valid id already, and returns the id it holds then.
 * An id is never changed: only a note without one, or a copy of another note (`replace`), gets one.
 */
export async function writeQuestId(app: App, path: string, id: string, replace = false): Promise<string | null> {
  let held: string | null = null;
  const written = await changeFrontmatter(app, path, (frontmatter) => {
    const current = frontmatter[QUEST_PROPERTY.id];
    if (!replace && typeof current === 'string' && QUEST_ID.test(current)) held = current;
    else frontmatter[QUEST_PROPERTY.id] = held = id;
  });
  return written ? held : null;
}

/**
 * Names the campaign `name` in each of the quest notes, all at once. The notes are held as files,
 * not paths, so a note whose folder is renamed meanwhile (the campaign's own) is still written.
 */
export async function nameCampaignIn(app: App, notes: readonly TFile[], name: string): Promise<void> {
  await Promise.all(notes.map(async (note) => {
    try {
      await app.fileManager.processFrontMatter(note, (frontmatter: Frontmatter) => { frontmatter[QUEST_PROPERTY.campaign] = name; });
    } catch (error) {
      console.error(`[Atlas] Could not name the renamed campaign in ${note.path}:`, error);
    }
  }));
}
