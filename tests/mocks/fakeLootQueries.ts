import type { LootQueryListener } from '../../src/app/loot/lootQueryView';

/** A query the reader started: the view it runs, and whether it was stopped. */
export interface FakeQuery {
  viewName: string;
  listener: LootQueryListener;
  stopped: boolean;
}

/**
 * Stands in for `src/app/loot/lootQueryView` so tests drive Obsidian's answers
 * themselves: `vi.mock('.../lootQueryView', () => import('../mocks/fakeLootQueries'))`.
 */
export const fakeQueries = {
  /** What `lootBasesAvailable` answers. */
  available: true,
  started: [] as FakeQuery[],
  reset(): void {
    this.available = true;
    this.started = [];
  },
  /** The query of `viewName`; throws when none was started. */
  of(viewName: string): FakeQuery {
    const found = this.started.find((entry) => entry.viewName === viewName);
    if (!found) throw new Error(`no query for ${viewName}`);
    return found;
  },
};

export function lootBasesAvailable(): boolean {
  return fakeQueries.available;
}

export class LootBaseQuery {
  private readonly record: FakeQuery;

  constructor(_app: unknown, config: { views: { name: string }[] }, _sourcePath: string, listener: LootQueryListener) {
    this.record = { viewName: config.views[0]?.name ?? '', listener, stopped: false };
  }

  start(): Promise<void> {
    fakeQueries.started.push(this.record);
    return Promise.resolve();
  }

  stop(): void {
    this.record.stopped = true;
  }
}
