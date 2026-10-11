import type { PlayerInfo } from '../../../../src/app/online/protocol/index.ts';
import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import type { TokenEntity } from '../../../../src/app/types';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { Ownership, readOwnership } from '../../../../src/app/online/gm/ownership.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { app, atlasTab, FakeSocket, png, present, workspace, type FakeTab } from './fakeTable.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';
import { advanceSettled } from './settled.ts';
import { sceneState } from './shareHarness.ts';

/*
 * A running table with two heroes in a cave of the collection `Cairn`, for tests of the players'
 * books. Each test file mocks `obsidian` and the GM's marks itself.
 */

/** A message the companion sent, as the player it went to reads it: a message sent in parts is put together. */
export interface Delivered {
  readonly to: string;
  readonly body: Readonly<Record<string, unknown>>;
}

interface Part {
  readonly id: string;
  readonly index: number;
  readonly count: number;
  readonly data: string;
}

/** Every game message the socket was given, in order, with who it was for; parts as the one message they make. */
export function delivered(socket: FakeSocket): Delivered[] {
  const parts = new Map<string, string[]>();
  return socket.frames().flatMap((frame): Delivered[] => {
    if (frame.t !== 'send' || frame.body === undefined) return [];
    const to = frame.to ?? '';
    const body = frame.body as Readonly<Record<string, unknown>>;
    if (body.t !== 'part') return [{ to, body }];
    const part = body as unknown as Part;
    const held = parts.get(`${to}\n${part.id}`) ?? [];
    held[part.index] = part.data;
    parts.set(`${to}\n${part.id}`, held);
    if (held.filter((data) => typeof data === 'string').length < part.count) return [];
    return [{ to, body: JSON.parse(Buffer.concat(held.map((data) => Buffer.from(data, 'base64'))).toString('utf8')) as Record<string, unknown> }];
  });
}

/** The messages of these types among them. */
export const ofType = (messages: readonly Delivered[], ...types: readonly string[]): Delivered[] => messages.filter(({ body }) => types.includes(String(body.t)));

/** Everything sent as text, whoever it was for: what a secret is searched in. */
export const traffic = (messages: readonly Delivered[]): string => messages.map(({ body }) => JSON.stringify(body)).join('\n');

export const ANA = 'anaanaanaanaanaanaan';
export const BEN = 'benbenbenbenbenbenbe';
export const CAL = 'calcalcalcalcalcalca';
export const MAP = 'atlas-vtt/collections/Cairn/scenes/Cave.atlasmap';
export const WORLD_MAP = 'atlas-vtt/collections/Cairn/maps/The Wide World.png';
export const BRANNOCH = 'tok-brannoch';
export const MIRA = 'tok-mira';
export const BRANNOCH_ART = 'atlas-vtt/collections/Cairn/tokens/brannoch.png';
export const MIRA_ART = 'atlas-vtt/collections/Cairn/tokens/mira.png';
/** A value of the resource players never see: found in what was sent, it leaked. */
export const DOOM = 31337;

const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, mapPath: MAP, gate: { code: '483912', requireCode: false, askToJoin: false } };

/** The collection's resources: hit points players see, and a doom track they never do. */
const RESOURCES: readonly ResourceDefinition[] = [
  { key: 'hp', name: 'Hit Points', field: 'hp', direction: 'drains', color: '#CC3333', visibleToPlayers: true },
  { key: 'doom', name: 'Doom Track', field: 'doom', direction: 'fills', color: '#333333', visibleToPlayers: false },
];

const hero = (id: string, name: string, imagePath: string, hp: number): TokenEntity => ({
  id, kind: 'character', name, imagePath, x: 140, y: 140, ringColor: '#abc', resources: { hp: { current: hp, max: 12 }, doom: { current: DOOM, max: 99999 } },
});

/** The cave with Brannoch and Mira in it, in that order; `changes` are other fields of the two tokens. */
export function cave(changes: { readonly brannoch?: Partial<TokenEntity>; readonly mira?: Partial<TokenEntity> } = {}): SceneState {
  const tokens = {
    [BRANNOCH]: { ...hero(BRANNOCH, 'Brannoch', BRANNOCH_ART, 7), ...changes.brannoch } as TokenEntity,
    [MIRA]: { ...hero(MIRA, 'Mira', MIRA_ART, 4), ...changes.mira } as TokenEntity,
  };
  return sceneState({ mapPath: MAP, background: 'maps/cave.png', objects: { ...sceneState().objects, tokens } });
}

/** The vault of the tests: the cave's map, the two heroes' artwork and the collection's world map. */
export function vaultFiles(): Map<string, Uint8Array> {
  return new Map([['maps/cave.png', png(700, 700)], [BRANNOCH_ART, png(4, 4)], [MIRA_ART, png(6, 6)], [WORLD_MAP, png(1200, 800)]]);
}

export interface OpenTable {
  readonly online: OnlineControl;
  readonly ownership: Ownership;
  readonly socket: FakeSocket;
  readonly tab: FakeTab;
  /** A player's message, as the relay hands it on. */
  from(player: string, body: object): void;
}

/**
 * A table that came back with the cave presented, welcomed with these players: Ana plays Brannoch
 * and Ben plays Mira unless `owners` says otherwise. The collection `Cairn` names the world map.
 */
export async function openTable(shelf: BookShelf, players: readonly PlayerInfo[], owners: Readonly<Record<string, string>> = { [BRANNOCH]: ANA, [MIRA]: BEN }): Promise<OpenTable> {
  workspace.files = vaultFiles();
  workspace.assets = {
    getCollectionForMap: (path: string) => (path.includes('collections/Cairn/') ? 'Cairn' : null),
    getCollectionSettings: () => ({ conditions: [], worldMap: WORLD_MAP }),
  };
  const tab = atlasTab(cave());
  tab.view.renderer = {
    ...fakeTokenSource(() => tab.store.getState(), () => undefined, () => 70),
    getTokenRenderer: () => ({ collectionSync: { resources: () => RESOURCES, conditions: () => [] } }),
  };
  workspace.leaves = [tab.leaf];
  present(tab);
  const ownership = new Ownership(readOwnership({ players: Object.fromEntries(players.map(({ id, name }) => [id, { name }])), owners }), () => undefined);
  const online = new OnlineControl(app, ownership, undefined, undefined, undefined, shelf);
  online.resume(SAVED);
  await advanceSettled(0);
  const socket = FakeSocket.all.at(-1);
  if (socket === undefined) throw new Error('no socket');
  socket.relay({ t: 'welcome', role: 'gm', players });
  await advanceSettled(1_000);
  return { online, ownership, socket, tab, from: (player, body) => socket.relay({ t: 'game', from: player, body }) };
}
