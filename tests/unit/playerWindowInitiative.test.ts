import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { attachFakePlayerWindow } from '../mocks/playerPopout';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
const collection = vi.hoisted(() => ({ hpVisibleToPlayers: false }));
vi.mock('../../src/app/resources/collectionResources', () => ({
  mapResources: () => [{ key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: collection.hpVisibleToPlayers }],
}));
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); collection.hpVisibleToPlayers = false; });

function scene(name = 'Hero', initiativeTrackerOpen = true): StoreApi<ViewAtlasState> {
  const token: TokenEntity = { id: 'hero', kind: 'character', name, x: 0, y: 0, imagePath: '', resources: { hp: { current: 8, max: 10 } } };
  const entry: InitiativeEntry = {
    id: 'entry', tokenId: token.id, name, initiative: 18, initiativeModifier: 2,
    imagePath: '', isActive: true, isNPC: false, order: 0,
  };
  return createStore(() => ({
    initiative: { ...createDefaultInitiativeState(), entries: [entry], isActive: true, round: 1 },
    objects: { tokens: { hero: token } }, initiativeTrackerOpen,
  })) as StoreApi<ViewAtlasState>;
}

function setup(initiativeTrackerOpen = true): { service: PlayerWindowService; settings: SettingsService; store: StoreApi<ViewAtlasState>; doc: Document; source: PlayerFrameSource; collectionChanged: () => void } {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { app } = createInMemoryApp();
  const settings = new SettingsService(app);
  const store = scene('Hero', initiativeTrackerOpen);
  const service = new PlayerWindowService(app, store, settings);
  const source = { canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store };
  const doc = attachFakePlayerWindow(service, source);
  const collectionChanged = (): void => vi.mocked(app.workspace.on).mock.calls
    .filter(([name]) => (name as string) === 'atlas-vtt:collection-settings-changed')
    .forEach(([, handler]) => (handler as (id: string) => void)('collection'));
  return { service, settings, store, doc, source, collectionChanged };
}

describe('player initiative panel', () => {
  it('gates player sharing independently of other widgets and follows combat changes', () => {
    const { settings, store, doc } = setup();
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    expect(panel()).not.toBeNull();
    expect(panel()?.textContent).toContain('18');
    expect(panel()?.textContent).toContain('Round 1');
    expect(panel()?.querySelector('button, input, [draggable="true"]')).toBeNull();
    settings.setLocalPlayerViewSettings({ showWidgets: false });
    expect(panel()).not.toBeNull();
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    expect(panel()).toBeNull();
    store.setState({ initiative: { ...store.getState().initiative, round: 2 } });
    settings.setLocalPlayerViewSettings({ showInitiative: true });
    expect(panel()?.textContent).toContain('Round 2');
    expect(store.getState().initiativeTrackerOpen).toBe(true);
  });

  it('requires the DM tracker to be open and reacts immediately to visibility changes', () => {
    const { settings, store, doc } = setup(false);
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    expect(settings.getLocalPlayerViewSettings().showInitiative).toBe(true);
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).not.toBeNull();
    store.setState({ initiativeTrackerOpen: false });
    expect(panel()).toBeNull();
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: false });
    settings.setLocalPlayerViewSettings({ showInitiative: true });
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).not.toBeNull();
  });

  it('excludes hidden and deleted tokens, and shows names and HP only where players may see them', () => {
    const { settings, store, doc } = setup();
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    expect(panel()?.textContent).not.toContain('Hero');
    expect(panel()?.querySelector('progress')).toBeNull();
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    expect(panel()?.textContent).toContain('Hero');
    // HP stays hidden until the collection lets players see it
    expect(panel()?.querySelector('progress')).toBeNull();
    collection.hpVisibleToPlayers = true;
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true, showGrid: false });
    expect(panel()?.querySelector('progress')?.value).toBe(8);
    const objects = store.getState().objects;
    store.setState({ objects: { ...objects, tokens: { hero: { ...objects.tokens.hero!, isHidden: true } } } });
    expect(panel()).toBeNull();
    store.setState({ objects: { ...objects, tokens: {} } });
    expect(panel()).toBeNull();
  });

  it('shows and hides HP as soon as the collection changes what players see', () => {
    const { doc, collectionChanged } = setup();
    const progress = (): Element | null => doc.querySelector('[aria-label="Initiative order"] progress');
    expect(progress()).toBeNull();
    collection.hpVisibleToPlayers = true;
    collectionChanged();
    expect(progress()).not.toBeNull();
    collection.hpVisibleToPlayers = false;
    collectionChanged();
    expect(progress()).toBeNull();
  });

  it('shows a token without hit points without an HP bar', () => {
    const { settings, store, doc, collectionChanged } = setup();
    collection.hpVisibleToPlayers = true;
    collectionChanged();
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    const objects = store.getState().objects;
    const { resources: _resources, ...withoutHp } = objects.tokens.hero!;

    expect(() => store.setState({ objects: { ...objects, tokens: { hero: withoutHp as typeof objects.tokens.hero } } })).not.toThrow();

    const panel = doc.querySelector('[aria-label="Initiative order"]');
    expect(panel?.textContent).toContain('Hero');
    expect(panel?.querySelector('progress')).toBeNull();
  });

  it('holds the presented initiative while browsing and binds to a newly presented view', () => {
    const { service, settings, store, doc, source } = setup();
    service.holdCurrentFrame();
    store.setState({ initiative: { ...store.getState().initiative, round: 9 } });
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    expect(doc.body.textContent).toContain('Round 1');
    expect(doc.body.textContent).not.toContain('Round 9');
    service.releaseHeldFrame(source);
    expect(doc.body.textContent).toContain('Round 9');
    const other = scene('Other hero');
    service.presentCanvas({ ...source, store: other }, 'scene-b');
    expect(doc.body.textContent).toContain('Other hero');
    other.setState({ initiative: { ...other.getState().initiative, round: 3 } });
    expect(doc.body.textContent).toContain('Round 3');
    service.destroy();
    const before = doc.body.textContent;
    other.setState({ initiative: { ...other.getState().initiative, round: 4 } });
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    expect(doc.body.textContent).toBe(before);
  });

  it('keeps the presented map\'s tracker visibility while the DM browses another map', () => {
    const { service, store, doc, source } = setup(false);
    const panel = (): Element | null => doc.querySelector('[aria-label="Initiative order"]');
    service.holdCurrentFrame();
    // Switching tabs loads the other map into the same view store.
    store.setState({ initiativeTrackerOpen: true, initiative: { ...store.getState().initiative, round: 5 } });
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: false });
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()).toBeNull();
    // Returning to the presented map resumes following its live state.
    store.setState({ initiativeTrackerOpen: false });
    service.releaseHeldFrame(source);
    expect(panel()).toBeNull();
    store.setState({ initiativeTrackerOpen: true });
    expect(panel()?.textContent).toContain('Round 5');
  });

  it('keeps a shown tracker while the DM browses a map with the tracker closed', () => {
    const { service, store, doc } = setup();
    service.holdCurrentFrame();
    store.setState({ initiativeTrackerOpen: false, objects: { tokens: {} } });
    expect(doc.querySelector('[aria-label="Initiative order"]')?.textContent).toContain('Round 1');
  });

  it('keeps the initiative of a closed presented map without following its store', () => {
    const { service, store, doc } = setup();
    service.releaseSource(store);
    store.setState({ initiativeTrackerOpen: false, initiative: { ...store.getState().initiative, round: 9 } });
    expect(doc.body.textContent).toContain('Round 1');
    const next = scene();
    next.setState({ initiative: { ...next.getState().initiative, round: 4 } });
    service.presentCanvas({ canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store: next }, 'scene-b');
    expect(doc.body.textContent).toContain('Round 4');
  });

  it('defaults on for old settings and persists the DM choice across reloads', async () => {
    const { app } = createInMemoryApp({ files: { 'atlas-vtt/settings.json': JSON.stringify({ localPlayerView: { showWidgets: false } }) } });
    const settings = new SettingsService(app);
    await settings.initialize();
    expect(settings.getLocalPlayerViewSettings().showInitiative).toBe(true);
    settings.setLocalPlayerViewSettings({ showInitiative: false });
    await settings.saveSettingsNow();
    const reloaded = new SettingsService(app);
    await reloaded.initialize();
    expect(reloaded.getLocalPlayerViewSettings()).toMatchObject({ showInitiative: false, showWidgets: false });
  });
});

describe('player initiative panel and what the players\' tokens see', () => {
  const AVATAR = 'data:image/png;base64,AAAA';
  const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity =>
    ({ id, kind: 'character', name: id, x: 0, y: 0, imagePath: AVATAR, resources: { hp: { current: 4, max: 10 } }, ...extra }) as TokenEntity;
  const entry = (tokenId: string, order: number): InitiativeEntry =>
    ({ id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 20 - order, initiativeModifier: 0, imagePath: AVATAR, isActive: order === 0, isNPC: tokenId !== 'hero', order });

  function lit(perceived: Record<string, 'seen' | 'sensed' | 'unseen'> | undefined): { doc: Document; store: StoreApi<ViewAtlasState>; sightChanged: () => void; see: (next: Record<string, 'seen' | 'sensed' | 'unseen'> | undefined) => void; service: PlayerWindowService } {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    collection.hpVisibleToPlayers = true;
    const { app } = createInMemoryApp();
    const settings = new SettingsService(app);
    settings.setLocalPlayerViewSettings({ showTokenNameplates: true });
    const store = createStore(() => ({
      initiative: { ...createDefaultInitiativeState(), entries: [entry('hero', 0), entry('goblin', 1), entry('rat', 2)], isActive: true, round: 1 },
      objects: { tokens: { hero: token('hero', { vision: { enabled: true } }), goblin: token('goblin'), rat: token('rat') } },
      initiativeTrackerOpen: true,
    })) as StoreApi<ViewAtlasState>;
    const service = new PlayerWindowService(app, store, settings);
    let current = perceived;
    const listeners = new Set<() => void>();
    const source: PlayerFrameSource = {
      canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store,
      tokenSight: () => (current ? (id: string) => current![id] ?? 'seen' : undefined),
      onTokenSightChange: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    };
    const doc = attachFakePlayerWindow(service, source);
    return { doc, store, service, sightChanged: () => listeners.forEach((listener) => listener()), see: (next) => { current = next; } };
  }
  const cards = (doc: Document): { name: string; avatar: boolean; hp: boolean }[] =>
    [...doc.querySelectorAll('[aria-label="Initiative order"] [role="listitem"]')].map((card) => ({
      name: card.querySelector('.atlas-player-initiative__name')?.textContent ?? '',
      avatar: card.querySelector('img') !== null,
      hp: card.querySelector('progress') !== null,
    }));

  it('leaves out a token the players do not perceive, names a sensed one without portrait and resources, and always shows a party token', () => {
    // The party token is dragged out of the sight it left behind: on the canvas it is gone for now, in the list it stays.
    const { doc } = lit({ hero: 'unseen', goblin: 'unseen', rat: 'sensed' });
    expect(cards(doc)).toEqual([{ name: 'hero', avatar: true, hp: true }, { name: 'rat', avatar: false, hp: false }]);
  });

  it('follows the players\' sight when it changes without a change of the scene', () => {
    const { doc, see, sightChanged } = lit({ goblin: 'unseen', rat: 'unseen' });
    expect(cards(doc).map((card) => card.name)).toEqual(['hero']);
    see({ goblin: 'seen', rat: 'sensed' });
    // Nothing is drawn anew until the view says its sight changed.
    expect(cards(doc)).toHaveLength(1);
    sightChanged();
    expect(cards(doc)).toEqual([{ name: 'hero', avatar: true, hp: true }, { name: 'goblin', avatar: true, hp: true }, { name: 'rat', avatar: false, hp: false }]);
  });

  it('shows every entry while sight hides nothing: an unlit scene, or one without a token that sees', () => {
    const { doc, see, sightChanged } = lit(undefined);
    expect(cards(doc).map((card) => card.name)).toEqual(['hero', 'goblin', 'rat']);
    see({ goblin: 'unseen' });
    sightChanged();
    expect(cards(doc).map((card) => card.name)).toEqual(['hero', 'rat']);
    see(undefined);
    sightChanged();
    expect(cards(doc)).toHaveLength(3);
  });

  it('still leaves out a token the GM hid, whatever the sight', () => {
    const { doc, store } = lit({});
    const { objects } = store.getState();
    store.setState({ objects: { ...objects, tokens: { ...objects.tokens, rat: { ...objects.tokens.rat!, isHidden: true } } } });
    expect(cards(doc).map((card) => card.name)).toEqual(['hero', 'goblin']);
  });

  it('listens to the sight of the scene it presents only', () => {
    const { service, sightChanged, store, doc, see } = lit({ goblin: 'unseen' });
    // Another scene is presented from a source without lighting.
    service.presentCanvas({ canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store }, 'scene-a');
    expect(cards(doc)).toHaveLength(3);
    see({ goblin: 'unseen', rat: 'unseen' });
    sightChanged();
    expect(cards(doc)).toHaveLength(3);
  });
});
