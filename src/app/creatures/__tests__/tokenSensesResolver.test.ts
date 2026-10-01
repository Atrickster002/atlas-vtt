import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SENSES } from '../../gameSystems/senses';
import type { TokenVision } from '../../types/lightingTypes';
import type { SenseDefinition, TokenSense } from '../../types/senseTypes';
import type { IndexedCreature } from '../CreatureIndex';
import { tokenSensesResolver, type CreatureSource, type SenseRules } from '../tokenSensesResolver';

const DND = BUILT_IN_SENSES['builtin:dnd5e']!;
const PATHFINDER = BUILT_IN_SENSES['builtin:pathfinder2e']!;
const FEET: SenseRules = { definitions: DND, unit: { unitType: 'feet', unitDistance: 5 } };

const GOBLIN = 'Bestiary/Goblin.md';
const ORC = 'Bestiary/Orc.md';

function named(senses: readonly TokenSense[], definitions: readonly SenseDefinition[] = DND): Array<[string, number?]> {
  return senses.map((sense) => {
    const name = definitions.find((definition) => definition.id === sense.id)?.name ?? `? ${sense.id}`;
    return sense.range === undefined ? [name] : [name, sense.range];
  });
}

function token(statblockPath: string | undefined, vision: TokenVision = { enabled: true }): { vision: TokenVision; statblockPath?: string } {
  return { vision, ...(statblockPath && { statblockPath }) };
}

/** An index whose entries a test sets by hand; like the real one, it tells its listeners when a request starts. */
function fakeIndex(): CreatureSource & { set: (path: string, senses: string | null) => void; request: ReturnType<typeof vi.fn>; listeners: Set<() => void> } {
  const entries = new Map<string, IndexedCreature | null>();
  const listeners = new Set<() => void>();
  const tell = (): void => { for (const listener of [...listeners]) listener(); };
  return {
    listeners,
    get: (path) => entries.get(path),
    request: vi.fn(() => tell()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: (path, senses) => {
      entries.set(path, senses === null ? null : { path, fields: { senses }, layout: null });
      tell();
    },
  };
}

describe('tokenSensesResolver', () => {
  it('gives a token its own senses without asking for its statblock', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, () => FEET);
    const own = [{ id: DND[0]!.id, range: 30 }];
    expect(resolver.sensesOf(token(GOBLIN, { enabled: true, senses: own }))).toEqual(own);
    expect(named(resolver.sensesOf(token(GOBLIN, { enabled: true, darkvision: 30 })))).toEqual([['Darkvision', 30]]);
    expect(resolver.sensesOf(token(undefined))).toEqual([]);
    expect(index.request).not.toHaveBeenCalled();
  });

  it('asks the index for the statblock of a token that follows it, and has no senses until it is read', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, () => FEET);
    expect(resolver.sensesOf(token(GOBLIN))).toEqual([]);
    expect(index.request).toHaveBeenCalledWith([GOBLIN]);
    index.set(GOBLIN, 'darkvision 60 ft., passive Perception 9');
    expect(named(resolver.sensesOf(token(GOBLIN)))).toEqual([['Darkvision', 60]]);
    expect(index.request).toHaveBeenCalledTimes(1);
  });

  it('reads the rules anew on every call, so a changed collection shows at the next rebuild', () => {
    const index = fakeIndex();
    index.set(GOBLIN, 'darkvision 60 ft., scent (imprecise) 30 feet');
    let rules = FEET;
    const resolver = tokenSensesResolver(index, () => rules);
    expect(named(resolver.sensesOf(token(GOBLIN)))).toEqual([['Darkvision', 60]]);
    rules = { definitions: PATHFINDER, unit: { unitType: 'meters', unitDistance: 1.5 } };
    expect(named(resolver.sensesOf(token(GOBLIN)), PATHFINDER)).toEqual([['Darkvision', 18], ['Scent', 9]]);
  });

  it('says where a statblock makes a creature blind beyond its senses', () => {
    const index = fakeIndex();
    index.set(GOBLIN, 'blindsight 30 ft. (blind beyond this radius)');
    const resolver = tokenSensesResolver(index, () => FEET);
    expect(resolver.visionOf(token(GOBLIN))).toMatchObject({ source: 'statblock', blindBeyond: true, sightRange: 30 });
  });

  it('tells its listeners when a statblock it was asked about is read or changes, and only then', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, () => FEET);
    const listener = vi.fn();
    resolver.subscribe(listener);

    resolver.sensesOf(token(GOBLIN));
    // The request itself changes the index's pending state, not the statblock.
    expect(listener).not.toHaveBeenCalled();

    index.set(ORC, 'darkvision 60 ft.');
    expect(listener).not.toHaveBeenCalled();

    index.set(GOBLIN, 'darkvision 60 ft.');
    expect(listener).toHaveBeenCalledTimes(1);
    resolver.sensesOf(token(GOBLIN));

    index.set(ORC, 'darkvision 120 ft.');
    expect(listener).toHaveBeenCalledTimes(1);

    index.set(GOBLIN, 'darkvision 120 ft.');
    expect(listener).toHaveBeenCalledTimes(2);
    index.set(GOBLIN, null);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('listens to the index only while someone listens to it', () => {
    const index = fakeIndex();
    const resolver = tokenSensesResolver(index, () => FEET);
    resolver.sensesOf(token(GOBLIN));
    expect(index.listeners.size).toBe(0);
    const first = resolver.subscribe(vi.fn());
    const second = resolver.subscribe(vi.fn());
    expect(index.listeners.size).toBe(1);
    first();
    expect(index.listeners.size).toBe(1);
    second();
    expect(index.listeners.size).toBe(0);
  });

  it('notices a statblock that changed while nobody listened', () => {
    const index = fakeIndex();
    index.set(GOBLIN, 'darkvision 60 ft.');
    const resolver = tokenSensesResolver(index, () => FEET);
    resolver.sensesOf(token(GOBLIN));
    index.set(GOBLIN, 'darkvision 120 ft.');
    const listener = vi.fn();
    resolver.subscribe(listener);
    index.set(ORC, 'tremorsense 60 ft.');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
