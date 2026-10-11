import type { GmMessage, PlayerRoll, RollRefusal } from '../protocol/index.ts';
import { parseFormula } from '../../tools/parseFormula';
import type { TokenEntity } from '../../types';
import type { DiceRollResult } from '../../types/diceTypes';
import type { DiceSource } from './atlasDice.ts';
import { tokenLabel } from './atlasView.ts';
import { MoveRate } from './moveCheck.ts';

/** Rolls a player may make: a burst of `ROLL_BURST`, then `ROLLS_PER_SECOND`. */
export const ROLL_BURST = 3;
export const ROLLS_PER_SECOND = 1;

/** What a player's roll is checked against. */
export interface RollContext {
  /** The shared scene whose token list players were last sent, or null while none is. */
  readonly scene: string | null;
  readonly mapPath: string | null;
  /** The GM id of a token in that list, by the id players know it by. */
  listedToken(alias: string): string | undefined;
  ownerOf(tokenId: string): string | undefined;
  readonly tokens: Readonly<Record<string, TokenEntity>>;
}

export type RollVerdict = { readonly ok: true; readonly tokenId: string | null } | { readonly ok: false; readonly reason: RollRefusal };

/**
 * Whether Atlas's dice tool rolls a formula as it stands: it parses, and holds at least one die.
 * Atlas completes a formula without dice with the map's default roll, and tells a formula it cannot
 * parse with a notice on the GM's screen; neither is for a player to cause.
 */
export function rollableFormula(formula: string): boolean {
  const parsed = parseFormula(formula);
  return parsed.ok && parsed.terms.some((term) => term.kind === 'dice' && term.count > 0);
}

/**
 * Whether the GM rolls a player's formula: it names the shared scene and is rollable. It names its
 * token only when that token is in the list players see, not hidden now and the sender's (by the id
 * the relay stamped); any other token is left out and the roll names nobody.
 */
export function checkRoll(from: string, message: PlayerRoll, context: RollContext): RollVerdict {
  if (context.scene === null || context.mapPath === null || message.scene !== context.scene) return { ok: false, reason: 'scene' };
  if (!rollableFormula(message.formula)) return { ok: false, reason: 'formula' };
  const tokenId = message.token === null ? undefined : context.listedToken(message.token);
  const token = tokenId === undefined ? undefined : context.tokens[tokenId];
  const named = tokenId !== undefined && token !== undefined && token.isHidden !== true && context.ownerOf(tokenId) === from;
  return { ok: true, tokenId: named ? tokenId : null };
}

export interface PlayerRollsPorts {
  context(): RollContext;
  /** The shared tab's dice, or null when it has none. */
  dice(): DiceSource | null;
  /** Runs a roll as `who`'s, so the roll's announcement goes to players as theirs (`RollShare.rollAs`). */
  rollAs(who: string, run: () => void): void;
  send(body: GmMessage, to?: string): void;
  now(): number;
}

/**
 * Players' rolls, made by the GM's own Atlas: the shared tab's dice tool rolls the formula by the map's
 * rules (criticals, exploding dice), throws it on the GM's screen and logs it, for the player's token
 * when the check lets it name one. A roll that is not made is refused to its sender alone.
 */
export class PlayerRolls {
  private readonly rate = new MoveRate(ROLL_BURST, ROLLS_PER_SECOND);
  private readonly ports: PlayerRollsPorts;

  constructor(ports: PlayerRollsPorts) {
    this.ports = ports;
  }

  receive(from: string, message: PlayerRoll): void {
    if (!this.rate.take(from, this.ports.now())) return this.refuse('rate', from);
    const context = this.ports.context();
    const verdict = checkRoll(from, message, context);
    if (!verdict.ok) return this.refuse(verdict.reason, from);
    const dice = this.ports.dice();
    if (dice === null || context.mapPath === null) return this.refuse('unavailable', from);
    const { tokenId } = verdict;
    const token = tokenId === null ? undefined : context.tokens[tokenId];
    const source: NonNullable<DiceRollResult['source']> = tokenId === null || token === undefined ? { type: 'toolbar' } : { type: 'toolbar', tokenId, tokenName: tokenLabel(token) };
    const origin = tokenId === null ? undefined : { viewId: dice.viewId, mapPath: context.mapPath, tokenId };
    let rolled = false;
    this.ports.rollAs(from, () => {
      rolled = dice.rollDice(message.formula, source, origin) !== null;
    });
    if (!rolled) this.refuse('unavailable', from);
  }

  private refuse(reason: RollRefusal, to: string): void {
    this.ports.send({ t: 'roll-refused', reason }, to);
  }
}
