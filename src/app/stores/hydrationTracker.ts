import { toError } from '../utils/errors';

interface Hydration {
  isSuperseded: () => boolean;
  failed: boolean;
  error?: unknown;
  /** The state the storage's content was merged into, which zustand then sets as it is. */
  merged?: object;
}

/**
 * Follows the rehydrations of a persisted store, for two things zustand leaves open:
 * it reports a failed rehydration only to `onRehydrateStorage`, and it applies the
 * storage's state whenever the read returns, even after another load took the store over.
 */
export class HydrationTracker {
  private current: Hydration | null = null;

  /** @param getState The store's state; undefined before the store exists. */
  constructor(private readonly getState: () => object | undefined) {}

  /**
   * Runs `rehydrate` and rejects unless the store took the storage's state completely.
   * Once `isSuperseded` reports true, a read that is still under way is dropped.
   */
  async run(rehydrate: () => Promise<void> | void, isSuperseded: () => boolean): Promise<void> {
    const hydration: Hydration = { isSuperseded, failed: false };
    this.current = hydration;
    try {
      await rehydrate();
    } finally {
      if (this.current === hydration) this.current = null;
    }
    if (!hydration.failed) return;
    // zustand sets the merged state before it tells the subscribers. A store that holds exactly
    // that object took the storage's state completely, and the error came from a subscriber:
    // the data is whole, so the scene opens. The reporter has logged the error.
    if (hydration.merged !== undefined && this.getState() === hydration.merged) return;
    throw toError(hydration.error, 'The scene data could not be restored');
  }

  /** Call from the store's `merge` with its result. */
  merged<S extends object>(state: S): S {
    if (this.current) this.current.merged = state;
    return state;
  }

  /** The storage read of the rehydration that is starting. Throws when the rehydration was replaced before the read returned. */
  async read<T>(read: () => Promise<T>): Promise<T> {
    const hydration = this.current;
    const value = await read();
    if (hydration && (hydration !== this.current || hydration.isSuperseded())) {
      throw new Error('A newer scene load replaced this one');
    }
    return value;
  }

  /** What `onRehydrateStorage` returns for the rehydration that is starting; `log` gets every error that is not a replaced read. */
  reporter(log: (error: unknown) => void): (state: unknown, error?: unknown) => void {
    const hydration = this.current;
    return (_state, error) => {
      if (error === undefined) return;
      if (hydration) {
        hydration.failed = true;
        hydration.error = error;
      }
      if (!hydration?.isSuperseded()) log(error);
    };
  }
}
