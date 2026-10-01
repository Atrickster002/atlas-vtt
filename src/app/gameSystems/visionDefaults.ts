import type { AssetService } from '../services/AssetService';
import type { TokenVisionDefaults } from '../types/lightingTypes';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';
import { positiveNumber } from '../utils/numberInput';
import { coneAngle } from '../vision/visionCone';
import { parseTokenSenses } from './senseValidation';

const DISTANCE_FIELDS = ['range', 'darkvision', 'tremorsense'] as const;

/**
 * The usable part of stored default vision, read as the forms read it: distances above 0, a cone
 * angle as `coneAngle` takes it (360 is no cone, so it is dropped), senses as `parseTokenSenses`
 * reads them (with the collection's `definitions`, only senses it knows), anything else (unknown
 * fields, `enabled`) dropped. Undefined when nothing is left, since an empty default means new
 * tokens get no vision settings.
 */
export function parseVisionDefaults(raw: unknown, definitions?: readonly SenseDefinition[]): TokenVisionDefaults | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const result: TokenVisionDefaults = {};
  for (const field of DISTANCE_FIELDS) {
    const value = positiveNumber(record[field]);
    if (value !== undefined) result[field] = value;
  }
  const angle = coneAngle(record.angle);
  if (angle !== undefined) result.angle = angle;
  const senses = parseTokenSenses(record.senses, definitions);
  if (senses && senses.length > 0) result.senses = senses;
  return hasVisionDefaults(result) ? result : undefined;
}

/** Whether `defaults` sets anything new tokens would start with; an empty list of senses sets nothing. */
export function hasVisionDefaults(defaults: TokenVisionDefaults | undefined): defaults is TokenVisionDefaults {
  return defaults !== undefined
    && Object.values(defaults).some((value) => (Array.isArray(value) ? value.length > 0 : value !== undefined));
}

/** A list of senses as a comparable key, whatever its order. */
function sensesKey(senses: readonly TokenSense[] | undefined): string {
  return (senses ?? []).map((sense) => `${sense.id}=${sense.range ?? ''}`).sort().join('\n');
}

/** Whether two defaults give tokens the same vision; none and empty are the same. */
export function sameVisionDefaults(a: TokenVisionDefaults | undefined, b: TokenVisionDefaults | undefined): boolean {
  return a?.range === b?.range
    && a?.darkvision === b?.darkvision
    && a?.tremorsense === b?.tremorsense
    && a?.angle === b?.angle
    && sensesKey(a?.senses) === sensesKey(b?.senses);
}

/** The default vision of the collection that holds `mapPath`; undefined when it or the map has none. */
export function mapVisionDefaults(
  assetService: Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'>,
  mapPath: string | null | undefined,
): TokenVisionDefaults | undefined {
  const collectionId = mapPath ? assetService.getCollectionForMap(mapPath) : null;
  return collectionId ? parseVisionDefaults(assetService.getCollectionSettings(collectionId).defaultTokenVision) : undefined;
}
