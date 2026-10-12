import type { StoredRecord } from '../services/recordFiles/recordLayout';

/**
 * A campaign: a record of its own, in its own folder beside the collections and with nothing to
 * do with them. It may use any asset of any collection; it keeps what happened in it and what
 * belongs to its players.
 */
export interface Campaign {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** When it was made, and last played (milliseconds since the epoch). */
  readonly createdAt: number;
  readonly lastPlayed?: number;
  /** The time played in all its sessions, in milliseconds. */
  readonly playtime?: number;
  /** The day of the next session, `YYYY-MM-DD`. */
  readonly nextSession?: string;
  /** The world map: a map or scene of any collection, by asset id. */
  readonly worldMap?: string;
  /** Written by a newer Atlas: read, never changed here. */
  readonly readOnly?: true;
}

/** A campaign as its file holds it, with every field a newer Atlas may have added. */
export type StoredCampaign = StoredRecord;

/** The fields a campaign's settings change; a field given as undefined is removed. */
export type CampaignChanges = Partial<Pick<Campaign, 'description' | 'nextSession' | 'worldMap'>>;
