import type { DiceCrit } from '../tools/diceCrit';
import type { RolledDie } from '../tools/diceFormula';
import type { AdvantageSide, RolledWithSet } from './diceSetTypes';

export interface DiceRollResult {
  id: string;
  timestamp: number;
  formula: string;
  rolls: RolledDie[];
  modifiers: number;
  total: number;
  /** Decided by the collection's critical rule when rolled; missing on rolls logged before rules existed. */
  crit?: DiceCrit;
  /** The dice set a bare bonus rolled with, where it was not the collection's own (a statblock template's). */
  diceSet?: RolledWithSet;
  /** The side of advantage the roll was made with, where the set's rule changed it; the dice it dropped are marked `dropped`. */
  advantage?: AdvantageSide;
  player?: string;
  source?: {
    type: 'toolbar' | 'statblock';
    /** Let the roll follow its token's or statblock's current artwork. */
    tokenId?: string;
    statblockPath?: string;
    tokenName?: string;
    tokenImagePath?: string;
    abilityName?: string;
  };
}
