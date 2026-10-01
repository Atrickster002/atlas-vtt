import type { App } from 'obsidian';

export const LIGHTING_ATTEMPTS_KEY = 'atlas-vtt:lighting-attempts';

/** One view's attempts to light its map with the GPU engine. */
export interface LightingAttempt {
  /** Notes that lighting the map starts now. False when an earlier start on it never finished: do not start. */
  begin(): boolean;
  /** The engine drew the map, or the attempt was called off in an orderly way: the note goes. */
  finish(): void;
}

type LocalStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

/** Maps a view of this session is attempting now: their notes are not left over from a crash. */
const running = new Set<string>();

/**
 * The crash-loop breaker of dynamic lighting. A graphics process that dies while the engine
 * builds a map takes Atlas' error handling with it, and the map would crash again on every
 * open. So the map's path is noted before the first build and the note removed after the first
 * lit frame; a note found at the next start means that attempt never finished.
 *
 * Notes live in the vault's local storage: they describe this device's graphics, and never
 * sync to another one.
 */
export class StoredLightingAttempt implements LightingAttempt {
  private open: string | null = null;

  constructor(private readonly storage: LocalStorage, private readonly mapPath: () => string | null) {}

  begin(): boolean {
    const path = this.mapPath();
    if (!path) return true;
    const noted = this.read();
    // This view's own attempt, begun again: a lost WebGL context cut it short.
    if (this.open === path || (noted.includes(path) && !running.has(path))) return false;
    this.finish();
    this.open = path;
    running.add(path);
    this.write([...noted.filter((other) => other !== path), path]);
    return true;
  }

  finish(): void {
    if (this.open) this.drop(this.open);
  }

  /** Drops the note on the view's map, whoever left it: the GM asks for another attempt. */
  forget(): void {
    const path = this.open ?? this.mapPath();
    if (path) this.drop(path);
  }

  private drop(path: string): void {
    this.open = null;
    running.delete(path);
    const noted = this.read();
    if (noted.includes(path)) this.write(noted.filter((other) => other !== path));
  }

  private read(): string[] {
    try {
      const stored: unknown = this.storage.loadLocalStorage(LIGHTING_ATTEMPTS_KEY);
      return Array.isArray(stored) ? stored.filter((path): path is string => typeof path === 'string') : [];
    } catch (error) {
      console.error('[Atlas] Could not read the lighting attempts', error);
      return [];
    }
  }

  private write(paths: string[]): void {
    try {
      this.storage.saveLocalStorage(LIGHTING_ATTEMPTS_KEY, paths.length > 0 ? paths : null);
    } catch (error) {
      console.error('[Atlas] Could not save the lighting attempts', error);
    }
  }
}
