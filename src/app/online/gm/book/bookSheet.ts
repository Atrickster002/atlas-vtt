import { isResourceKey, MAX_BOOK_TITLE, MAX_SHEET_RESOURCES, MAX_TOKEN_VALUE, parseBookCharacter, type AssetRef, type BookCharacter, type SheetResource } from '../../protocol/index.ts';
import type { ResourceDefinition, ResourceHolder } from '../../../resources/resourceTypes';
import { visibleResources } from '../../../resources/visibleResources';
import type { ShownRollToken } from '../../../services/playerRollSource';
import { hexColour, ringColour } from '../scenePicture.ts';
import { clippedLine } from './bookTexts.ts';

const DIRECTIONS: readonly string[] = ['drains', 'fills', 'static'];

const isValue = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= MAX_TOKEN_VALUE;

/**
 * The resources on a character's sheet: those players may see (`visibleResources` for the viewer
 * `player`), bars and wheels alike, by name. A resource the GM hides from players is hidden from
 * its own player too, and nothing of it is read. Each names its key, and the player may change
 * every one but a fixed value (`static`), which the statblock gives.
 */
function sheetResources(token: ResourceHolder, definitions: readonly ResourceDefinition[]): SheetResource[] {
  return visibleResources(token, definitions, 'player').flatMap(({ definition, value }): SheetResource[] => {
    const name = clippedLine(definition.name, MAX_BOOK_TITLE);
    const colour = hexColour(definition.color);
    if (name === null || colour === null || !DIRECTIONS.includes(definition.direction) || !isValue(value.current) || !isValue(value.max)) return [];
    const key = isResourceKey(definition.key) ? definition.key : null;
    return [{ key, name, colour, direction: definition.direction, current: value.current, max: value.max, editable: key !== null && definition.direction !== 'static' }];
  }).slice(0, MAX_SHEET_RESOURCES);
}

/**
 * The sheet of a player's own character, from its token as the players' frame shows it: its name
 * (always: the nameplate setting hides other tokens' names, not one's own), artwork by hash, the
 * ring's colour (none for artwork shown unframed) and its resources. Null when it cannot be told.
 */
export function sheetOf(shown: ShownRollToken, token: ResourceHolder, definitions: readonly ResourceDefinition[], art: (path: string) => AssetRef | null): BookCharacter | null {
  return parseBookCharacter({
    name: clippedLine(shown.name, MAX_BOOK_TITLE) ?? '',
    art: shown.imagePath === undefined ? null : art(shown.imagePath),
    ring: shown.showRing ? ringColour(shown.ringColor) : null,
    resources: sheetResources(token, definitions),
  }) ?? null;
}
