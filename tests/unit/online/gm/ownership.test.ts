// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { selectedTokenIds, tokenLabel } from '../../../../src/app/online/gm/atlasView.ts';
import { Ownership, readOwnership, type OwnershipData } from '../../../../src/app/online/gm/ownership.ts';
import { sceneState, token } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const MAP = 'Scenes/Cave.atlasmap';
const seeing = token('seeing', { vision: { enabled: true } });
const blind = token('blind');

/** Ownership whose saves land in `saved`, as the plugin's data file would hold them. */
function ownership(data: unknown = undefined): { readonly owners: Ownership; readonly saved: OwnershipData[] } {
  const saved: OwnershipData[] = [];
  return { owners: new Ownership(readOwnership(data), (next) => saved.push(JSON.parse(JSON.stringify(next)) as OwnershipData)), saved };
}

describe('token ownership', () => {
  it('is saved with the players\' names and read back the same', () => {
    const { owners, saved } = ownership();
    owners.joined({ id: ANA, name: 'Ana' });
    owners.joined({ id: BEN, name: 'Ben' });
    owners.give(['gm-fighter', 'gm-rogue'], ANA);
    owners.give(['gm-rogue'], BEN);
    const data = saved.at(-1);
    expect(data).toEqual({ players: { [ANA]: { name: 'Ana' }, [BEN]: { name: 'Ben' } }, owners: { 'gm-fighter': ANA, 'gm-rogue': BEN }, playerTokens: {} });
    const again = ownership(data).owners;
    expect(again.ownerOf('gm-fighter')).toBe(ANA);
    expect(again.tokensOf(BEN)).toEqual(['gm-rogue']);
    expect(again.list().map(({ name, online }) => [name, online])).toEqual([['Ana', false], ['Ben', false]]);
  });

  it('keeps nothing it cannot trust from saved data', () => {
    const owners = ownership({
      players: { [ANA]: { name: 'Ana' }, 'not-an-id': { name: 'Eve' }, [BEN]: { name: '\n' } },
      owners: { 'gm-1': ANA, 'gm-2': BEN, 'gm-3': 'nobody', ['x'.repeat(300)]: ANA },
      playerTokens: { 'Scenes/Cave.atlasmap': { 'gm-1': true, 'gm-2': 'yes', ['x'.repeat(300)]: true }, 'Scenes/Empty.atlasmap': { 'gm-3': 1 }, ['p'.repeat(1001)]: { 'gm-4': true }, 'Scenes/Bad.atlasmap': [] },
    }).owners;
    expect(owners.toData()).toEqual({ players: { [ANA]: { name: 'Ana' } }, owners: { 'gm-1': ANA }, playerTokens: { 'Scenes/Cave.atlasmap': { 'gm-1': true } } });
    expect(ownership('garbage').owners.toData()).toEqual({ players: {}, owners: {}, playerTokens: {} });
  });

  it('gives tokens back to nobody, and only to players it knows', () => {
    const { owners } = ownership();
    owners.joined({ id: ANA, name: 'Ana' });
    owners.give(['gm-1', 'gm-2'], ANA);
    owners.give(['gm-1'], null);
    owners.give(['gm-2'], BEN);
    expect(owners.toData().owners).toEqual({ 'gm-2': ANA });
  });

  it('forgets a removed player and their tokens, and a new table forgets everyone', () => {
    const { owners, saved } = ownership();
    owners.welcome([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
    owners.give(['gm-1'], ANA);
    owners.give(['gm-2'], BEN);
    owners.remove(ANA);
    expect(saved.at(-1)).toEqual({ players: { [BEN]: { name: 'Ben' } }, owners: { 'gm-2': BEN }, playerTokens: {} });
    expect(owners.onlinePlayers()).toEqual([BEN]);
    owners.markPlayerTokens(MAP, ['gm-3'], true);
    owners.reset();
    expect(saved.at(-1)).toEqual({ players: {}, owners: {}, playerTokens: { [MAP]: { 'gm-3': true } } });
  });

  it('follows who is online without saving, and saves a changed name', () => {
    const { owners, saved } = ownership();
    let changes = 0;
    owners.onChange(() => (changes += 1));
    owners.joined({ id: ANA, name: 'Ana' });
    const count = saved.length;
    owners.left(ANA);
    owners.joined({ id: ANA, name: 'Ana' });
    expect(saved.length).toBe(count);
    owners.joined({ id: ANA, name: 'Ana B.' });
    expect(saved.at(-1)?.players[ANA]).toEqual({ name: 'Ana B.' });
    expect(changes).toBe(4);
  });
});

describe('player tokens', () => {
  it('are the tokens on the players\' side until the GM marks them, per scene, and outlive a table', () => {
    const { owners, saved } = ownership();
    expect([owners.isPlayerToken(MAP, 'seeing', seeing), owners.isPlayerToken(MAP, 'blind', blind)]).toEqual([true, false]);
    expect(owners.isPlayerToken(MAP, 'blind', { ...blind, side: 'players' })).toBe(true);
    owners.markPlayerTokens(MAP, ['seeing'], false);
    owners.markPlayerTokens(MAP, ['blind'], true);
    expect([owners.isPlayerToken(MAP, 'seeing', seeing), owners.isPlayerToken(MAP, 'blind', blind)]).toEqual([false, true]);
    expect(owners.isPlayerToken('Scenes/Other.atlasmap', 'seeing', seeing)).toBe(true);
    const again = ownership(saved.at(-1)).owners;
    again.reset();
    expect(again.isPlayerToken(MAP, 'blind', blind)).toBe(true);
  });

  it('are open to claim until a player has them, and making a token the GM\'s takes it back', () => {
    const { owners } = ownership();
    owners.joined({ id: ANA, name: 'Ana' });
    expect(owners.claimOf(MAP, 'seeing', seeing)).toBe('open');
    expect(owners.claimOf(MAP, 'blind', blind)).toBeNull();
    expect(owners.claim('seeing', ANA)).toBe(true);
    expect(owners.claimOf(MAP, 'seeing', seeing)).toBe('taken');
    owners.give(['blind'], ANA);
    expect(owners.claimOf(MAP, 'blind', blind)).toBe('taken');
    expect(owners.seats(MAP, { seeing, blind, other: token('other') }).map(({ tokenId, owner }) => [tokenId, owner?.name])).toEqual([['seeing', 'Ana'], ['blind', 'Ana']]);
    owners.markPlayerTokens(MAP, ['seeing'], false);
    expect([owners.ownerOf('seeing'), owners.claimOf(MAP, 'seeing', seeing)]).toEqual([undefined, null]);
  });

  it('are claimed once, by a player it knows, and given back only by the GM', () => {
    const { owners } = ownership();
    owners.joined({ id: ANA, name: 'Ana' });
    owners.joined({ id: BEN, name: 'Ben' });
    expect(owners.claim('seeing', 'c'.repeat(20))).toBe(false);
    expect(owners.claim('seeing', ANA)).toBe(true);
    expect(owners.claim('seeing', BEN)).toBe(false);
    expect(owners.ownerOf('seeing')).toBe(ANA);
    owners.give(['seeing'], null);
    expect(owners.ownerOf('seeing')).toBeUndefined();
  });
});

describe('the GM\'s selection', () => {
  it('gives only tokens, and names them as the GM knows them', () => {
    const fighter = { ...token('f'), kind: 'character' as const, name: 'Fighter' };
    const state = { ...sceneState({ objects: { ...sceneState().objects, tokens: { f: fighter, g: token('g') } } }), selectedIds: ['wall-1', 'f', 'g'] };
    expect(selectedTokenIds(state)).toEqual(['f', 'g']);
    expect(selectedTokenIds(sceneState())).toEqual([]);
    expect([tokenLabel(fighter), tokenLabel(token('g'))]).toEqual(['Fighter', 'g']);
  });
});
