import { parseAsset, type AssetRef } from './asset.ts';
import { isRecord } from './shape.ts';
import { COLOUR_PATTERN, MAX_NAME } from './tokens.ts';

/** Combatants one `initiative` message may list. */
export const MAX_COMBATANTS = 200;
export const INITIATIVE_SIDES = ['players', 'opponents'] as const;
export type SharedSide = (typeof INITIATIVE_SIDES)[number];

/** A combatant on the players' initiative list: never one whose token is hidden. */
export interface SharedCombatant {
  readonly initiative: number;
  /** Shown only while the player view shows names. */
  readonly name: string | null;
  /** The combatant has the turn (in turn order, while a fight runs). */
  readonly turn: boolean;
  readonly sitsOut: boolean;
  /** The portrait's artwork, asked for by hash like the map. */
  readonly art: AssetRef | null;
  /** The ring around the portrait (`#rrggbb`, or null untinted); absent for an unframed token. */
  readonly ring: { readonly colour: string | null } | null;
  readonly side: SharedSide;
  /** Hit points, where the collection shows them to players. */
  readonly hp: { readonly current: number; readonly max: number } | null;
}

/** The players' initiative list, as Atlas's player window shows it. */
export interface SharedInitiative {
  readonly isActive: boolean;
  readonly round: number;
  readonly bySides: boolean;
  readonly firstSide: SharedSide;
  readonly activeSide: SharedSide | null;
  readonly combatants: readonly SharedCombatant[];
}

const isNumber = (value: unknown, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
const isSide = (value: unknown): value is SharedSide => INITIATIVE_SIDES.includes(value as SharedSide);

function parseCombatant(value: unknown): SharedCombatant | null {
  if (!isRecord(value) || !isNumber(value.initiative, 1e9) || typeof value.turn !== 'boolean' || typeof value.sitsOut !== 'boolean' || !isSide(value.side)) return null;
  const { name, ring, hp } = value;
  if (name !== null && (typeof name !== 'string' || name.length > MAX_NAME)) return null;
  const art = value.art === null ? null : parseAsset(value.art);
  if (value.art !== null && art === null) return null;
  if (ring !== null && (!isRecord(ring) || (ring.colour !== null && (typeof ring.colour !== 'string' || !COLOUR_PATTERN.test(ring.colour))))) return null;
  if (hp !== null && (!isRecord(hp) || !isNumber(hp.current, 1e9) || !isNumber(hp.max, 1e9))) return null;
  return {
    initiative: value.initiative, name, turn: value.turn, sitsOut: value.sitsOut, art, side: value.side,
    ring: ring === null ? null : { colour: ring.colour as string | null },
    hp: hp === null ? null : { current: hp.current as number, max: hp.max as number },
  };
}

/** The list of an `initiative` message: null for none shown, undefined for anything malformed. */
export function parseInitiative(value: unknown): SharedInitiative | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.isActive !== 'boolean' || typeof value.bySides !== 'boolean' || !isNumber(value.round, 1e9) || !isSide(value.firstSide)) return undefined;
  if (value.activeSide !== null && !isSide(value.activeSide)) return undefined;
  if (!Array.isArray(value.combatants) || value.combatants.length > MAX_COMBATANTS) return undefined;
  const combatants: SharedCombatant[] = [];
  for (const entry of value.combatants) {
    const combatant = parseCombatant(entry);
    if (combatant === null) return undefined;
    combatants.push(combatant);
  }
  return { isActive: value.isActive, round: value.round, bySides: value.bySides, firstSide: value.firstSide, activeSide: value.activeSide, combatants };
}
