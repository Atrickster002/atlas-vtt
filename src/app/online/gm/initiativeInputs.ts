import { MAX_COMBATANTS, MAX_NAME, type AssetRef, type SharedCombatant, type SharedInitiative } from '../protocol/index.ts';
import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { collectionInitiativeRules, DEFAULT_INITIATIVE_RULES } from '../../gameSystems/initiativeRules';
import { mapResources, type CollectionLookup } from '../../resources/collectionResources';
import { entryTokenOf, listedForPlayers, playerInitiativeList } from '../../services/playerInitiativeList';
import type { TokenEntity } from '../../types';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import type { ViewState } from '../../types/viewState';
import { ringColour } from './scenePicture.ts';

/** What the players' initiative list is made of. */
export interface InitiativeInputs {
  readonly state: Partial<Pick<ViewState, 'initiative' | 'initiativeTrackerOpen'>> & { readonly mapPath: string | null; readonly objects: { readonly tokens: Readonly<Record<string, TokenEntity>> } };
  /** The player view's initiative switch (`showInitiative`). */
  readonly shown: boolean;
  /** The player view's nameplate switch: without it no name is sent. */
  readonly showNames: boolean;
  /** Where the map's collection is looked up; without it the default rules and no hit points. */
  readonly collections: CollectionLookup | null;
  /** A portrait's artwork as players are sent it, by vault path; null while unknown. */
  art(path: string): AssetRef | null;
}

/** A number players are sent: finite and within the protocol's bound. */
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;

/**
 * The map's collection's initiative rules: its own, else its built-in preset's, else the default.
 * A user preset's rules are not readable from here; such a collection reads as the default.
 */
function rulesOf(collections: CollectionLookup | null, mapPath: string | null): InitiativeRules {
  const collection = collections !== null && mapPath !== null ? collections.getCollectionForMap(mapPath) : null;
  return collection === null || collections === null ? { ...DEFAULT_INITIATIVE_RULES } : collectionInitiativeRules(collections.getCollectionSettings(collection), BUILT_IN_SYSTEM_PRESETS);
}

/**
 * The players' initiative list as Atlas's player window shows it (`PlayerInitiativePanel`): only
 * while the GM's tracker is open and the player view shows it; every entry whose token is on the
 * map and not hidden, in turn order or by sides; names only with nameplates, hit points only where
 * the collection shows them to players. Nothing of a hidden token's entry is read.
 */
export function sharedInitiative(inputs: InitiativeInputs): SharedInitiative | null {
  const { state, collections } = inputs;
  const initiative = state.initiative;
  if (!inputs.shown || state.initiativeTrackerOpen !== true || initiative === undefined) return null;
  const tokens = state.objects.tokens;
  const hpVisible = collections !== null && mapResources(collections, state.mapPath).some((definition) => definition.key === 'hp' && definition.visibleToPlayers);
  const list = playerInitiativeList(
    initiative,
    (entry) => (listedForPlayers(tokens[entry.tokenId]) ? entryTokenOf(tokens[entry.tokenId]) : null),
    rulesOf(collections, state.mapPath),
    hpVisible,
  );
  const combatants = list.combatants.slice(0, MAX_COMBATANTS).map(({ entry, token }): SharedCombatant => ({
    initiative: finite(entry.initiative) ? entry.initiative : 0,
    name: inputs.showNames && typeof entry.name === 'string' ? entry.name.slice(0, MAX_NAME) : null,
    turn: list.isActive && !list.bySides && entry.isActive === true,
    sitsOut: entry.sitsOut === true,
    art: typeof entry.imagePath === 'string' && entry.imagePath !== '' ? inputs.art(entry.imagePath) : null,
    ring: token.showRing ? { colour: token.ringColor ? ringColour(token.ringColor) : null } : null,
    side: token.side,
    hp: token.hp !== null && finite(token.hp.current) && finite(token.hp.max) ? { current: token.hp.current, max: token.hp.max } : null,
  }));
  return {
    isActive: list.isActive,
    round: finite(list.round) ? list.round : 0,
    bySides: list.bySides,
    firstSide: list.firstSide,
    activeSide: list.bySides ? list.activeSide : null,
    combatants,
  };
}
