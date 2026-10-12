// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_ROLLED_DICE, parseGmMessage, parsePlayerMessage, type SharedRoll } from '../../../../src/app/online/protocol/index.ts';

const ALIAS = 'a1'.repeat(12);
const PLAYER = 'abcdefghijklmnopqrst';
const ROLL: SharedRoll = {
  id: 'roll_1', timestamp: 1_700_000_000_000, formula: '2d6 + 1', modifiers: 1, total: 9, crit: null,
  rolls: [{ die: 'd6', value: 6, max: 6 }, { die: 'd6', value: 2, max: 6, exploded: true }],
  source: { type: 'toolbar' },
};

describe('player rolls', () => {
  it('read a formula for a token or for nobody', () => {
    expect(parsePlayerMessage({ t: 'roll', scene: 's1', formula: '2d6 + 1', token: ALIAS })).toEqual({ t: 'roll', scene: 's1', formula: '2d6 + 1', token: ALIAS });
    expect(parsePlayerMessage({ t: 'roll', scene: 's1', formula: '1d20', token: null })).toEqual({ t: 'roll', scene: 's1', formula: '1d20', token: null });
  });

  it('carry a roll mode, a flavor and the roll button they answer; public is the absence of a mode', () => {
    const request = { id: '0'.repeat(24), index: 2 };
    expect(parsePlayerMessage({ t: 'roll', scene: 's1', formula: '1d20', token: null, mode: 'blind', flavor: '  Stealth ', request }))
      .toEqual({ t: 'roll', scene: 's1', formula: '1d20', token: null, mode: 'blind', flavor: 'Stealth', request });
    expect(parsePlayerMessage({ t: 'roll', scene: 's1', formula: '1d20', token: null, mode: 'public' })).toEqual({ t: 'roll', scene: 's1', formula: '1d20', token: null });
  });

  it('refuse long formulas, odd tokens and a missing scene', () => {
    for (const body of [
      { t: 'roll', scene: 's1', formula: `1d6${'+1'.repeat(50)}`, token: null },
      { t: 'roll', scene: 's1', formula: '1d6', token: null, mode: 'loud' },
      { t: 'roll', scene: 's1', formula: '1d6', token: null, request: { id: 'x', index: 0 } },
      { t: 'roll', scene: 's1', formula: '1d6', token: null, flavor: '\u202e' },
      { t: 'roll', scene: 's1', formula: 7, token: null },
      { t: 'roll', scene: 's1', formula: '1d6', token: 'gm-hero-id' },
      { t: 'roll', scene: 's1', formula: '1d6' },
      { t: 'roll', scene: '', formula: '1d6', token: null },
    ]) expect(parsePlayerMessage(body), JSON.stringify(body)).toBeNull();
  });
});

describe('shared rolls', () => {
  it('read a roll by a player or the GM, with or without a token', () => {
    expect(parseGmMessage({ t: 'roll', who: PLAYER, result: ROLL, token: ALIAS })).toEqual({ t: 'roll', who: PLAYER, result: ROLL, token: ALIAS });
    expect(parseGmMessage({ t: 'roll', who: 'gm', result: { ...ROLL, source: { type: 'statblock', abilityName: 'Bite' } }, token: null })).not.toBeNull();
    expect(parseGmMessage({ t: 'roll-refused', reason: 'rate' })).toEqual({ t: 'roll-refused', reason: 'rate' });
  });

  it('drop fields players are not meant to read', () => {
    const parsed = parseGmMessage({ t: 'roll', who: 'gm', result: { ...ROLL, player: 'Player', source: { type: 'toolbar', tokenId: 'gm-hero-id', tokenImagePath: 'art/hero.webp' } }, token: null });
    expect(parsed?.t === 'roll' ? parsed.result : null).toEqual({ ...ROLL, source: { type: 'toolbar' } });
  });

  it('refuse a die that cannot be, too many dice and odd totals before the dice see them', () => {
    const bad: unknown[] = [
      { ...ROLL, rolls: [{ die: 'd6', value: 7, max: 6 }] },
      { ...ROLL, rolls: [{ die: 'd20', value: 3, max: 6 }] },
      { ...ROLL, rolls: [{ die: 'd6', value: 0, max: 6 }] },
      { ...ROLL, rolls: [{ die: 'd1001', value: 1, max: 1001 }] },
      { ...ROLL, rolls: [{ die: 'd6', value: 2.5, max: 6 }] },
      { ...ROLL, rolls: [{ die: 'd6', value: 2, max: 6, negative: false }] },
      { ...ROLL, rolls: Array.from({ length: MAX_ROLLED_DICE + 1 }, () => ({ die: 'd6', value: 1, max: 6 })) },
      { ...ROLL, total: Number.NaN },
      { ...ROLL, total: Infinity },
      { ...ROLL, crit: 'maybe' },
      { ...ROLL, source: { type: 'macro' } },
      { ...ROLL, id: '' },
      { ...ROLL, rolls: 'd6' },
    ];
    for (const result of bad) expect(parseGmMessage({ t: 'roll', who: 'gm', result, token: null }), JSON.stringify(result).slice(0, 120)).toBeNull();
    expect(parseGmMessage({ t: 'roll', who: 'someone', result: ROLL, token: null })).toBeNull();
    expect(parseGmMessage({ t: 'roll-refused', reason: 'because' })).toBeNull();
  });
});
