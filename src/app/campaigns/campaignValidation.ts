import { CAMPAIGN_FORMAT } from './campaignPaths';
import type { Campaign, StoredCampaign } from './campaignTypes';

/** The longest name and description a campaign takes, in characters. */
export const MAX_CAMPAIGN_NAME = 120;
export const MAX_CAMPAIGN_DESCRIPTION = 4000;
const MAX_ASSET_ID = 200;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const textWithin = (value: unknown, max: number): string | undefined => (typeof value === 'string' && value.length <= max ? value : undefined);

/** A campaign's name as it is kept: trimmed, at most `MAX_CAMPAIGN_NAME` characters; null for none. */
export function campaignName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name !== '' && [...name].length <= MAX_CAMPAIGN_NAME ? name : null;
}

/**
 * A campaign as Atlas reads its file, or null for a file without a name. A field that cannot be
 * read is left unset, never guessed; a file of a later format is read and marked `readOnly`.
 */
export function parseCampaign(stored: StoredCampaign): Campaign | null {
  const name = campaignName(stored.name);
  if (name === null) return null;
  const description = textWithin(stored.description, MAX_CAMPAIGN_DESCRIPTION);
  const nextSession = typeof stored.nextSession === 'string' && DAY.test(stored.nextSession) ? stored.nextSession : undefined;
  const worldMap = textWithin(stored.worldMap, MAX_ASSET_ID);
  return {
    id: stored.id,
    name,
    createdAt: isTime(stored.createdAt) ? stored.createdAt : 0,
    ...(description !== undefined && description !== '' && { description }),
    ...(isTime(stored.lastPlayed) && { lastPlayed: stored.lastPlayed }),
    ...(isTime(stored.playtime) && { playtime: stored.playtime }),
    ...(nextSession !== undefined && { nextSession }),
    ...(worldMap !== undefined && worldMap !== '' && { worldMap }),
    ...(typeof stored.format === 'number' && stored.format > CAMPAIGN_FORMAT && { readOnly: true as const }),
  };
}

/** Whether a day is one a campaign's next session may be set to (`YYYY-MM-DD`). */
export const isSessionDay = (value: string): boolean => DAY.test(value);
