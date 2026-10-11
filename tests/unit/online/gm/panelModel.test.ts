// @vitest-environment node
import type { WorkspaceLeaf } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
  badgeOf, closingOf, groupsOf, menuModel, onlineApi, playerColour, seatsNoteOf, selectionBarOf, tooltipOf, PLAYER_COLOURS,
  type ControlSource, type OnlineSnapshot, type SceneFacts,
} from '../../../../src/app/online/gm/dock/panelModel.ts';
import { closingText, type LostTable } from '../../../../src/app/online/gm/tableEnd.ts';

const ANA = { id: 'a'.repeat(20), name: 'Ana', online: true };
const BEN = { id: 'b'.repeat(20), name: 'Ben', online: false };
const CLEM = { id: 'c'.repeat(20), name: 'clem', online: true };

const snapshot = (over: Partial<OnlineSnapshot> = {}): OnlineSnapshot => ({ status: 'online', link: 'https://play.atlas-vtt.dev/#code', sharedLeaf: null, sharedName: null, sharedTokens: {}, players: [], playerTokens: [], seats: null, gate: null, ...over });

const CAN_HOST = { kind: 'can-host', account: { id: 'acc_mara', handle: 'mara', name: 'Mara' }, access: { plan: 'beta', maxPlayers: 12, endsAt: null } } as const;

/** A table's gates as the control reads them: a fixed view, and every choice recorded. */
function fakeGate(): NonNullable<ControlSource['table']>['gate'] & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    view: () => ({ code: '483912', requireCode: true, askToJoin: true, waiting: [{ id: 'm'.repeat(20), name: 'Mira', answered: false, full: false, armed: true }], paused: false, pauseArmed: false }),
    newCode: () => void calls.push(['newCode']),
    setRequireCode: (on) => void calls.push(['setRequireCode', on]),
    setAskToJoin: (on) => void calls.push(['setAskToJoin', on]),
    admit: (id) => void calls.push(['admit', id]),
    decline: (id) => void calls.push(['decline', id]),
    moved: () => void calls.push(['moved']),
  };
}
const SIGNED_OUT = { kind: 'signed-out', notice: null } as const;

const scene = (over: Partial<SceneFacts> = {}): SceneFacts => ({
  isShared: true,
  tokens: { ogre: { imagePath: 'art/ogre.webp' }, bear: { imagePath: 'art/bear.webp', isHidden: true, ringColor: '#ff0000' }, wolf: { imagePath: 'art/wolf.webp', showRing: false } },
  selected: [],
  ...over,
});

describe('the badge', () => {
  it('shows nothing without a table, amber while connecting, green online, the count of players online, red when lost', () => {
    expect(badgeOf(snapshot({ status: 'idle' }), false)).toEqual({ kind: 'none' });
    expect(badgeOf(snapshot({ status: 'stopped' }), false)).toEqual({ kind: 'none' });
    expect(badgeOf(snapshot({ status: 'starting' }), false)).toEqual({ kind: 'dot', tone: 'amber', pulse: true });
    expect(badgeOf(snapshot({ status: 'reconnecting' }), false)).toEqual({ kind: 'dot', tone: 'amber', pulse: true });
    expect(badgeOf(snapshot({ players: [BEN] }), false)).toEqual({ kind: 'dot', tone: 'green', pulse: false });
    expect(badgeOf(snapshot({ players: [ANA, BEN, CLEM] }), false)).toEqual({ kind: 'count', count: 2 });
    expect(badgeOf(snapshot({ status: 'refused' }), true)).toEqual({ kind: 'dot', tone: 'red', pulse: false });
  });

  it('names the table and its players in the tooltip', () => {
    expect(tooltipOf(snapshot({ status: 'idle' }))).toBe('Online play');
    expect(tooltipOf(snapshot())).toBe('Online table · waiting for players');
    expect(tooltipOf(snapshot({ players: [ANA] }))).toBe('Online table · 1 player');
    expect(tooltipOf(snapshot({ players: [ANA, CLEM, BEN] }))).toBe('Online table · 2 players');
  });
});

describe('the menu', () => {
  it('offers Start without a table, with what the account may do', () => {
    expect(menuModel(snapshot({ status: 'idle' }), scene(), SIGNED_OUT)).toEqual({ kind: 'start', account: SIGNED_OUT, starting: false, lost: null });
    expect(menuModel(snapshot({ status: 'starting' }), scene(), CAN_HOST)).toEqual({ kind: 'start', account: CAN_HOST, starting: true, lost: null });
  });

  it('says how the last table ended when the server ended it, until the next one starts', () => {
    for (const lost of ['refused', 'no-access', 'superseded'] as const) {
      expect(menuModel(snapshot({ status: 'refused', lost }), scene(), CAN_HOST)).toEqual({ kind: 'start', account: CAN_HOST, starting: false, lost });
    }
    // A table that is starting, or one the GM stopped, was lost by nothing.
    expect(menuModel(snapshot({ status: 'starting', lost: 'no-access' }), scene(), CAN_HOST)).toMatchObject({ lost: null });
    expect(menuModel(snapshot({ status: 'stopped' }), scene(), CAN_HOST)).toMatchObject({ lost: null });
  });

  it('says when a running table closes because its account may no longer host, in the menu and by its own line', () => {
    const closesAt = Date.UTC(2026, 9, 12, 14, 30);
    expect(closingOf(snapshot())).toBeNull();
    expect(closingOf(snapshot({ closesAt }))).toBe(closingText(closesAt));
    expect(menuModel(snapshot({ closesAt }), scene(), CAN_HOST)).toMatchObject({ kind: 'waiting', closing: closingText(closesAt) });
    // Written out, in the time of whoever reads it.
    expect(closingText(closesAt, 'en-GB', 'UTC')).toBe('This table closes on 12 October 2026 at 14:30. Your account’s access to online play ended.');
    expect(closingText(closesAt, 'en-GB', 'Europe/Berlin')).toContain('12 October 2026 at 16:30');
  });

  it('says the table is full once as many players are online as the plan seats', () => {
    expect(seatsNoteOf(snapshot({ seats: 2, players: [ANA] }))).toBeNull();
    expect(seatsNoteOf(snapshot({ seats: 2, players: [ANA, CLEM, BEN] }))).toBe('Table full · 2 seats');
    expect(seatsNoteOf(snapshot({ seats: null, players: [ANA, CLEM] }))).toBeNull();
    expect(seatsNoteOf(snapshot({ status: 'reconnecting', seats: 1, players: [ANA] }))).toBeNull();
  });

  it('shows the link, the status and the shared map while players are awaited', () => {
    expect(menuModel(snapshot({ status: 'connecting' }), scene({ isShared: false }), CAN_HOST)).toEqual({
      kind: 'waiting', link: 'https://play.atlas-vtt.dev/#code', status: { text: 'Connecting…', tone: 'amber' }, isShared: false, gate: null, qr: false, imageShown: false, closing: null,
    });
    // The gates come along: the GM needs the code before the first player can join.
    // Who waits is not among it: a knock must not draw the menu anew under the GM's pointer.
    const gate = { code: '483912', requireCode: true, askToJoin: true, paused: false, pauseArmed: false };
    const waiting = [{ id: 'm'.repeat(20), name: 'Mira', answered: false, full: false, armed: false }];
    expect(menuModel(snapshot({ gate: { ...gate, waiting } }), scene(), CAN_HOST)).toEqual({ kind: 'waiting', link: 'https://play.atlas-vtt.dev/#code', status: { text: 'Online, waiting for players', tone: 'green' }, isShared: true, gate, qr: false, imageShown: false, closing: null });
    // The QR card's state is part of the menu, whose button says whether it is open.
    expect(menuModel(snapshot(), scene(), CAN_HOST, true)).toMatchObject({ kind: 'waiting', qr: true });
    // An image shown before anyone joined has its line here too.
    expect(menuModel(snapshot({ imageShown: true }), scene(), CAN_HOST)).toMatchObject({ kind: 'waiting', imageShown: true });
  });
});

describe('the list', () => {
  const claims = [
    { tokenId: 'ogre', label: 'Ogre', claimedBy: BEN.id },
    { tokenId: 'gone', label: 'Gone', claimedBy: null },
    { tokenId: 'bear', label: 'Bear', claimedBy: null },
    { tokenId: 'wolf', label: 'Wolf', claimedBy: ANA.id },
  ];

  it('groups tokens by player in name order, then the free ones, leaving out tokens the scene lost', () => {
    const groups = groupsOf(snapshot({ players: [CLEM, BEN, ANA], playerTokens: claims }), scene());
    expect(groups.map((group) => [group.player?.name ?? null, group.tokens.map((token) => token.tokenId)])).toEqual([
      ['Ana', ['wolf']], ['Ben', ['ogre']], ['clem', []], [null, ['bear']],
    ]);
    const bear = groups[3]?.tokens[0];
    expect(bear).toMatchObject({ label: 'Bear', hidden: true, ringColor: '#ff0000', showRing: true, owner: null });
    expect(groups[0]?.tokens[0]).toMatchObject({ showRing: false, hidden: false, owner: { name: 'Ana', initial: 'A' } });
  });

  it('keeps its order when a player goes away', () => {
    const before = groupsOf(snapshot({ players: [ANA, BEN], playerTokens: claims }), scene()).map((group) => group.player?.id);
    const after = groupsOf(snapshot({ players: [{ ...ANA, online: false }, { ...BEN, online: true }], playerTokens: claims }), scene()).map((group) => group.player?.id);
    expect(after).toEqual(before);
  });

  it('has a free group to say there are no player tokens, and none while every player token is taken', () => {
    expect(groupsOf(snapshot(), scene())).toEqual([{ player: null, tokens: [] }]);
    const taken = groupsOf(snapshot({ players: [ANA], playerTokens: [{ tokenId: 'wolf', label: 'Wolf', claimedBy: ANA.id }] }), scene());
    expect(taken.map((group) => group.player?.name ?? null)).toEqual(['Ana']);
  });

  it('gives every player a colour that never changes', () => {
    expect(playerColour(ANA.id)).toBe(playerColour('a'.repeat(20)));
    for (const id of [ANA.id, BEN.id, CLEM.id, 'x', '']) expect(playerColour(id)).toBeLessThan(PLAYER_COLOURS);
  });
});

describe('the selection bar', () => {
  const claims = [{ tokenId: 'ogre', label: 'Ogre', claimedBy: null }];

  it('is absent with nothing selected on the shared map', () => {
    expect(selectionBarOf(snapshot({ playerTokens: claims }), scene())).toBeNull();
  });

  it('offers Mark while a selected token is not a player token, Unmark once all are, and Assign with players', () => {
    expect(selectionBarOf(snapshot({ playerTokens: claims }), scene({ selected: ['ogre', 'bear', 'missing'] }))).toEqual({ kind: 'selected', tokenIds: ['ogre', 'bear'], action: 'mark', canAssign: false });
    expect(selectionBarOf(snapshot({ players: [ANA], playerTokens: claims }), scene({ selected: ['ogre'] }))).toEqual({ kind: 'selected', tokenIds: ['ogre'], action: 'unmark', canAssign: true });
  });

  it('offers to show this map in another map view, or while the shared view holds another scene', () => {
    expect(selectionBarOf(snapshot(), scene({ isShared: false, selected: ['ogre'] }))).toEqual({ kind: 'share' });
  });
});

/** A table that shows players no image. */
const NO_IMAGE = { isShown: false };
const hideNothing = (): void => undefined;

describe('the view of OnlineControl', () => {
  function control(): ControlSource & { state: { status: 'connecting' | 'online' | 'stopped' | 'refused' | null; link: string | null; starting: boolean; lost: LostTable | null }; calls: unknown[][] } {
    const state = { status: null as 'connecting' | 'online' | 'stopped' | 'refused' | null, link: null as string | null, starting: false, lost: null as LostTable | null };
    const calls: unknown[][] = [];
    return {
      state,
      calls,
      table: null,
      onChange: () => () => undefined,
      status: () => state.status,
      link: () => state.link,
      seats: () => null,
      isStarting: () => state.starting,
      lost: () => state.lost,
      start: (leaf) => {
        calls.push(['start', leaf]);
        return Promise.resolve(null);
      },
      stop: () => void calls.push(['stop']),
      share: (leaf) => void calls.push(['share', leaf]),
      players: () => [BEN, ANA],
      kick: (id) => void calls.push(['kick', id]),
      playerTokens: () => [{ tokenId: 'ogre', label: 'Ogre', owner: ANA }, { tokenId: 'bear', label: 'Bear', owner: null }],
      markPlayerTokens: (ids, player) => void calls.push(['mark', ids, player]),
      give: (ids, player) => void calls.push(['give', ids, player]),
    };
  }

  it('reads starting, connecting, reconnecting after being online, and a lost table', () => {
    const source = control();
    const api = onlineApi(source, hideNothing);
    expect(api.snapshot().status).toBe('idle');
    source.state.starting = true;
    expect(api.snapshot().status).toBe('starting');
    source.state.starting = false;
    source.state.link = 'one';
    source.state.status = 'connecting';
    expect(api.snapshot().status).toBe('connecting');
    source.state.status = 'online';
    expect(api.snapshot().status).toBe('online');
    source.state.status = 'connecting';
    expect(api.snapshot().status).toBe('reconnecting');
    source.state.link = 'two';
    expect(api.snapshot().status).toBe('connecting');
    expect(api.snapshot()).not.toHaveProperty('lost');
    source.state.status = null;
    for (const lost of ['refused', 'no-access', 'superseded'] as const) {
      source.state.lost = lost;
      expect(api.snapshot()).toMatchObject({ status: 'refused', lost });
    }
  });

  it('reads when the running table closes for want of access, and nothing while it does not', () => {
    const table = { sharedTab: null, sharedStore: null, presentedName: null, gate: fakeGate(), image: NO_IMAGE, closesAt: null as number | null };
    const api = onlineApi({ ...control(), table }, hideNothing);
    expect(api.snapshot()).not.toHaveProperty('closesAt');
    table.closesAt = 1760000000000;
    expect(api.snapshot().closesAt).toBe(1760000000000);
    expect(onlineApi(control(), hideNothing).snapshot()).not.toHaveProperty('closesAt');
  });

  it('names each token by who claimed it, and assigning marks the token too', () => {
    const source = control();
    const api = onlineApi(source, hideNothing);
    expect(api.snapshot().playerTokens).toEqual([{ tokenId: 'ogre', label: 'Ogre', claimedBy: ANA.id }, { tokenId: 'bear', label: 'Bear', claimedBy: null }]);
    const leaf = {} as WorkspaceLeaf;
    api.start(leaf);
    api.assign(['bear'], BEN.id);
    api.release(['ogre']);
    api.unmark(['bear']);
    expect(source.calls).toEqual([['start', leaf], ['mark', ['bear'], true], ['give', ['bear'], BEN.id], ['give', ['ogre'], null], ['mark', ['bear'], false]]);
  });

  it('names the scene players see and its tokens from the table\'s shared store, and none while nothing is shared', () => {
    const tokens = { ogre: { imagePath: 'art/ogre.webp' } };
    const shared = { getState: () => ({ objects: { tokens } }) };
    const table = { sharedTab: null, sharedStore: shared as typeof shared | null, presentedName: 'Kings Inn' as string | null, gate: fakeGate(), image: NO_IMAGE, closesAt: null };
    const source = { ...control(), table };
    const api = onlineApi(source, hideNothing);
    expect(api.snapshot()).toMatchObject({ sharedLeaf: null, sharedName: 'Kings Inn', sharedTokens: tokens });
    table.sharedStore = null;
    expect(api.snapshot()).toMatchObject({ sharedName: null, sharedTokens: {} });
  });

  it('reads the running table\'s gates and passes the GM\'s choices on; without a table there are none and nothing happens', () => {
    const gate = fakeGate();
    const api = onlineApi({ ...control(), table: { sharedTab: null, sharedStore: null, presentedName: null, gate, image: NO_IMAGE, closesAt: null } }, hideNothing);
    expect(api.snapshot().gate).toEqual(gate.view());
    api.gate.newCode();
    api.gate.setRequireCode(false);
    api.gate.setAskToJoin(false);
    api.gate.admit('m'.repeat(20));
    api.gate.decline('n'.repeat(20));
    api.gate.moved();
    expect(gate.calls).toEqual([['newCode'], ['setRequireCode', false], ['setAskToJoin', false], ['admit', 'm'.repeat(20)], ['decline', 'n'.repeat(20)], ['moved']]);
    const idle = onlineApi(control(), hideNothing);
    expect(idle.snapshot().gate).toBeNull();
    expect(() => (idle.gate.newCode(), idle.gate.admit('m'.repeat(20)))).not.toThrow();
  });

  it('says that players are shown an image only while they are, and hides it by the way it is given', () => {
    const image = { isShown: false };
    let hidden = 0;
    const api = onlineApi({ ...control(), table: { sharedTab: null, sharedStore: null, presentedName: null, gate: fakeGate(), image, closesAt: null } }, () => void (hidden += 1));
    expect(api.snapshot()).not.toHaveProperty('imageShown');
    image.isShown = true;
    expect(api.snapshot().imageShown).toBe(true);
    api.hideImage();
    expect(hidden).toBe(1);
    expect(onlineApi(control(), hideNothing).snapshot()).not.toHaveProperty('imageShown');
  });
});
