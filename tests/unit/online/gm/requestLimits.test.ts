// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_SERVES_PER_ASSET, REPEAT_REQUEST_MS, ServedAssets } from '../../../../src/app/online/gm/assetServe.ts';

const HASH = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe("how often a player is sent one asset", () => {
  it('ignores the same request within the window and serves it again after', () => {
    const served = new ServedAssets();
    expect(served.take('alice', HASH, 0, 0)).toBe(true);
    expect(served.take('alice', HASH, 0, REPEAT_REQUEST_MS - 1)).toBe(false);
    expect(served.take('alice', HASH, 0, REPEAT_REQUEST_MS)).toBe(true);
  });

  it('serves a download continued from another chunk', () => {
    const served = new ServedAssets();
    expect(served.take('alice', HASH, 0, 0)).toBe(true);
    expect(served.take('alice', HASH, 7, 1)).toBe(true);
  });

  it('stops at the cap whatever chunk or longest side is asked for, per player and asset', () => {
    const served = new ServedAssets();
    let taken = 0;
    for (let from = 0; from < 50; from++) if (served.take('alice', HASH, from, from)) taken += 1;
    for (let side = 256; side < 306; side++) if (served.take('alice', `${HASH}@${side}`, 0, 100 + side)) taken += 1;
    expect(taken).toBe(MAX_SERVES_PER_ASSET);
    expect(served.take('alice', OTHER, 0, 400)).toBe(true);
    expect(served.take('bob', HASH, 0, 400)).toBe(true);
  });

  it('serves again once the window has passed, and after the player was forgotten', () => {
    const served = new ServedAssets();
    for (let from = 0; from < MAX_SERVES_PER_ASSET; from++) served.take('alice', HASH, from, 0);
    expect(served.take('alice', HASH, 9, 1)).toBe(false);
    expect(served.take('alice', HASH, 9, REPEAT_REQUEST_MS)).toBe(true);
    for (let from = 20; from < 30; from++) served.take('alice', HASH, from, REPEAT_REQUEST_MS);
    served.forget('alice');
    expect(served.take('alice', HASH, 0, REPEAT_REQUEST_MS + 1)).toBe(true);
  });
});
