import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { FantasyStatblocksCreature } from '../../src/app/services/FantasyStatblocksService';

type Listener = (...data: unknown[]) => unknown;

/** Obsidian's `Events`: `on` returns a ref, `trigger` calls every listener of a name. */
function emitter(): { on: (name: string, cb: Listener) => { name: string; cb: Listener }; offref: (ref: { name: string; cb: Listener }) => void; trigger: (name: string, ...data: unknown[]) => void; count: () => number } {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on: (name, cb) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(cb);
      return { name, cb };
    },
    offref: (ref) => { listeners.get(ref.name)?.delete(ref.cb); },
    trigger: (name, ...data) => { for (const cb of listeners.get(name) ?? []) cb(...data); },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

interface Setup {
  app: App;
  files: Map<string, string>;
  frontmatter: Record<string, Record<string, unknown>>;
  bestiary: FantasyStatblocksCreature[];
  workspace: ReturnType<typeof emitter>;
  metadata: ReturnType<typeof emitter>;
  vault: ReturnType<typeof emitter>;
  getBestiaryCreatures: ReturnType<typeof vi.fn>;
}

function setup(): Setup {
  const { app, files } = createInMemoryApp({
    files: {
      'Bestiary/Goblin.md': '---\nstatblock: true\n---',
      'Bestiary/Orc.md': '```statblock\nname: Orc\ncr: 1/2\n```',
      'Notes/Plain.md': 'just a note',
    },
  });
  const frontmatter: Record<string, Record<string, unknown>> = {
    'Bestiary/Goblin.md': { statblock: true, name: 'Goblin', cr: '1/4', layout: 'Basic 5e Layout' },
  };
  const bestiary: FantasyStatblocksCreature[] = [];
  const getBestiaryCreatures = vi.fn(() => bestiary);
  const workspace = emitter();
  const metadata = emitter();
  const vault = emitter();
  Object.assign(app.workspace, { on: workspace.on, offref: workspace.offref });
  Object.assign(app.metadataCache, {
    on: metadata.on,
    offref: metadata.offref,
    getFileCache: (file: TFile) => ({ frontmatter: frontmatter[file.path] }),
  });
  Object.assign(app.vault, { on: vault.on, offref: vault.offref });
  Object.assign(window, {
    FantasyStatblocks: {
      getBestiaryCreatures,
      hasCreature: () => false,
      getCreatureFromBestiary: () => null,
    },
  });
  return { app, files, frontmatter, bestiary, workspace, metadata, vault, getBestiaryCreatures };
}

async function settled(index: CreatureIndex): Promise<void> {
  await vi.waitFor(() => expect(index.isPending()).toBe(false));
}

let current: Setup;
beforeEach(() => { current = setup(); });
afterEach(() => {
  CreatureIndex.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
  vi.useRealTimers();
});

describe('CreatureIndex', () => {
  it('reads statblocks from frontmatter, from fences, and knows notes without one', async () => {
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md', 'Bestiary/Orc.md', 'Notes/Plain.md', 'Gone.md']);
    expect(index.isPending()).toBe(true);
    await settled(index);

    expect(index.get('Bestiary/Goblin.md')).toMatchObject({ fields: { cr: '1/4', name: 'Goblin' }, layout: 'Basic 5e Layout' });
    expect(index.get('Bestiary/Orc.md')?.fields).toMatchObject({ name: 'Orc', cr: '1/2' });
    expect(index.get('Notes/Plain.md')).toBeNull();
    expect(index.get('Gone.md')).toBeNull();
    expect(index.get('Never/Asked.md')).toBeUndefined();
  });

  it('prefers the bestiary entry and scans the bestiary once per batch', async () => {
    current.bestiary.push({ name: 'Goblin Boss', path: 'Bestiary/Goblin.md', cr: 1 });
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md', 'Bestiary/Orc.md']);
    await settled(index);
    expect(index.get('Bestiary/Goblin.md')?.fields).toMatchObject({ name: 'Goblin Boss', cr: 1 });
    expect(current.getBestiaryCreatures).toHaveBeenCalledTimes(1);
  });

  it('does not resolve a note twice', async () => {
    const index = CreatureIndex.forApp(current.app);
    const read = vi.spyOn(current.app.vault, 'cachedRead');
    index.request(['Bestiary/Orc.md']);
    await settled(index);
    index.request(['Bestiary/Orc.md']);
    await settled(index);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('re-reads a note when it changes and tells subscribers', async () => {
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md']);
    await settled(index);
    const listener = vi.fn();
    index.subscribe(listener);

    current.frontmatter['Bestiary/Goblin.md']!.cr = 2;
    current.metadata.trigger('changed', new TFile('Bestiary/Goblin.md'));
    await settled(index);

    expect(index.get('Bestiary/Goblin.md')?.fields.cr).toBe(2);
    expect(listener).toHaveBeenCalled();
  });

  it('keeps the old entry readable while the new one resolves', async () => {
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Orc.md']);
    await settled(index);
    current.files.set('Bestiary/Orc.md', '```statblock\nname: Orc\ncr: 3\n```');
    current.metadata.trigger('changed', new TFile('Bestiary/Orc.md'));
    expect(index.get('Bestiary/Orc.md')?.fields.cr).toBe('1/2');
    await settled(index);
    expect(index.get('Bestiary/Orc.md')?.fields.cr).toBe(3);
  });

  it('ignores changes to notes no token links', async () => {
    const index = CreatureIndex.forApp(current.app);
    const listener = vi.fn();
    index.subscribe(listener);
    current.metadata.trigger('changed', new TFile('Notes/Plain.md'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('forgets a statblock whose note is deleted or renamed', async () => {
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md', 'Bestiary/Orc.md']);
    await settled(index);

    current.files.delete('Bestiary/Goblin.md');
    current.vault.trigger('delete', new TFile('Bestiary/Goblin.md'));
    current.files.delete('Bestiary/Orc.md');
    current.files.set('Monsters/Orc.md', '');
    current.vault.trigger('rename', new TFile('Monsters/Orc.md'), 'Bestiary/Orc.md');
    await settled(index);

    expect(index.get('Bestiary/Goblin.md')).toBeNull();
    expect(index.get('Bestiary/Orc.md')).toBeNull();
  });

  it('re-reads every note once the bestiary settles after an update', async () => {
    vi.useFakeTimers();
    const index = CreatureIndex.forApp(current.app);
    index.request(['Bestiary/Goblin.md']);
    await vi.runAllTimersAsync();
    expect(index.get('Bestiary/Goblin.md')?.fields.name).toBe('Goblin');

    current.bestiary.push({ name: 'Hobgoblin', path: 'Bestiary/Goblin.md' });
    current.workspace.trigger('fantasy-statblocks:bestiary:updated');
    current.workspace.trigger('fantasy-statblocks:bestiary:updated');
    await vi.advanceTimersByTimeAsync(200);
    await vi.runAllTimersAsync();

    expect(index.get('Bestiary/Goblin.md')?.fields.name).toBe('Hobgoblin');
    expect(current.getBestiaryCreatures).toHaveBeenCalledTimes(2);
  });

  it('stops listening when released', () => {
    CreatureIndex.forApp(current.app);
    expect(current.workspace.count() + current.metadata.count() + current.vault.count()).toBeGreaterThan(0);
    CreatureIndex.release(current.app);
    expect(current.workspace.count() + current.metadata.count() + current.vault.count()).toBe(0);
  });
});
