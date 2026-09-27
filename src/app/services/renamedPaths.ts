import { normalizeImagePath } from '../utils/pathUtils';

/** A file that now lives at `to` instead of `from`. */
export interface PathMove {
  from: string;
  to: string;
}

/** Looks up where a stored path moved to, or null when it did not move. */
export type MovedPath = (candidate: string | null | undefined) => string | null;

/** Where stored paths go after `moves`; stored paths match in raw or normalized form. */
export function movedPathOf(moves: readonly PathMove[]): MovedPath {
  const targets = new Map<string, string>();
  for (const { from, to } of moves) {
    if (normalizeImagePath(from) !== normalizeImagePath(to)) targets.set(normalizeImagePath(from), to);
  }
  return (candidate) => (candidate ? targets.get(normalizeImagePath(candidate)) ?? null : null);
}

/** A pin target (`path` or `path#heading`) after the moves, or null when its file did not move. */
function movedPinTarget(target: string, moved: MovedPath): string | null {
  const hash = target.indexOf('#');
  const path = moved(hash === -1 ? target : target.slice(0, hash));
  return path === null ? null : path + (hash === -1 ? '' : target.slice(hash));
}

interface TokenPaths {
  imagePath?: string | undefined;
  statblockPath?: string | null | undefined;
}

interface PinPaths {
  notePath?: string | undefined;
}

/** The parts of a map that point at vault files, in a saved map file or a live store draft. */
export interface MapFileReferences {
  tokens?: Record<string, TokenPaths> | null | undefined;
  pins?: Record<string, PinPaths> | null | undefined;
}

/**
 * Points token art, token statblocks and pin targets at the new places of
 * moved files, in place. Returns whether anything changed.
 */
export function rewriteMapReferences(objects: MapFileReferences | null | undefined, moved: MovedPath): boolean {
  let changed = false;
  for (const token of Object.values(objects?.tokens ?? {})) {
    const imagePath = moved(token.imagePath);
    if (imagePath !== null) {
      token.imagePath = imagePath;
      changed = true;
    }
    const statblockPath = moved(token.statblockPath);
    if (statblockPath !== null) {
      token.statblockPath = statblockPath;
      changed = true;
    }
  }
  for (const pin of Object.values(objects?.pins ?? {})) {
    const target = pin.notePath ? movedPinTarget(pin.notePath, moved) : null;
    if (target !== null) {
      pin.notePath = target;
      changed = true;
    }
  }
  return changed;
}
