import type { StoreApi } from 'zustand';
import { shallow } from 'zustand/vanilla/shallow';
import type { ViewAtlasState } from '../storeFactory';
import type { TokenEntity } from '../types';
import type { Point } from '../types/visionTypes';
import { sightOnDropOn } from './sceneLightingOptions';

/** The tokens the pointer holds, each with the place it had when it was taken. */
export type HeldTokens = Readonly<Record<string, Point>>;

/**
 * Notes the tokens the pointer holds (pressed or dragged), or none once it lets go. A token
 * held before keeps the place it was taken from; a new one is noted where it stands now.
 */
export function holdTokens(store: Pick<StoreApi<ViewAtlasState>, 'getState'>, tokenIds: readonly string[]): void {
  const { heldTokens, objects, setHeldTokens } = store.getState();
  const before = Object.keys(heldTokens);
  if (before.length === tokenIds.length && tokenIds.every((id) => heldTokens[id])) return;
  const held: Record<string, Point> = {};
  for (const id of tokenIds) {
    const token = objects.tokens[id];
    const start = heldTokens[id] ?? (token && { x: token.x, y: token.y });
    if (start) held[id] = start;
  }
  setHeldTokens(held);
}

type SceneTokens = Pick<ViewAtlasState, 'objects' | 'lighting' | 'heldTokens'>;
type Tokens = Record<string, TokenEntity>;

/**
 * The tokens of a scene as its sight and light read them. With sight on drop (`sightOnDropOn`),
 * a vision token the pointer has moved counts as standing where it was taken, and so does the
 * light it carries: nothing along the way of a drag is seen, lit or remembered, and letting go
 * shows its new place at once. Every other token, and every move that is not a drag, is read
 * as the store holds it.
 *
 * While only held vision tokens move, `read` returns the same record, so a view that compares
 * records works nothing out during the drag.
 */
export class SightTokens {
  private last: Tokens | null = null;

  read({ objects, lighting, heldTokens }: SceneTokens): Tokens {
    const tokens = sightOnDropOn(lighting) ? this.withHeldAtStart(objects.tokens, heldTokens) : objects.tokens;
    this.last = tokens;
    return tokens;
  }

  private withHeldAtStart(tokens: Tokens, held: HeldTokens): Tokens {
    let result = tokens;
    for (const [id, start] of Object.entries(held)) {
      const token = tokens[id];
      if (!token?.vision?.enabled || (token.x === start.x && token.y === start.y)) continue;
      const atStart = { ...token, x: start.x, y: start.y };
      const before = this.last?.[id];
      if (result === tokens) result = { ...tokens };
      // The token as last read is kept while nothing but its place changed, so the record stays the same too.
      result[id] = before && shallow(before, atStart) ? before : atStart;
    }
    return result !== tokens && this.last && sameEntries(this.last, result) ? this.last : result;
  }
}

function sameEntries(a: Tokens, b: Tokens): boolean {
  const ids = Object.keys(a);
  return ids.length === Object.keys(b).length && ids.every((id) => a[id] === b[id]);
}
