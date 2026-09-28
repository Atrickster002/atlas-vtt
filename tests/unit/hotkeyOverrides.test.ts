import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { DEFAULT_MAP_HOTKEYS } from '../../src/app/keyboard/mapHotkeys';
import { readHotkeyOverrides, resolveHotkeys, withHotkey } from '../../src/app/keyboard/hotkeyOverrides';

const SETTINGS_PATH = 'atlas-vtt/.atlas-data/settings.json';

function vault(stored?: object): { app: never; files: Map<string, string> } {
  const files = new Map<string, string>();
  if (stored) files.set(SETTINGS_PATH, JSON.stringify(stored));
  const app = { vault: { adapter: {
    exists: async (path: string) => files.has(path) || [...files.keys()].some(file => file.startsWith(`${path}/`)),
    mkdir: async () => {},
    read: async (path: string) => files.get(path)!,
    write: async (path: string, data: string) => { files.set(path, data); },
  } } } as never;
  return { app, files };
}
const savedHotkeys = (files: Map<string, string>): unknown => (JSON.parse(files.get(SETTINGS_PATH)!) as { hotkeys: unknown }).hotkeys;

describe('hotkey overrides', () => {
  it('keeps only changed bindings from files that saved every binding', () => {
    const legacy = { ...DEFAULT_MAP_HOTKEYS, assets: 'q', diceTray: '', removedAction: 'x', move: 7 };
    expect(readHotkeyOverrides(legacy)).toEqual({ assets: 'q', diceTray: '' });
    expect(readHotkeyOverrides(null)).toEqual({});
    expect(readHotkeyOverrides(['a'])).toEqual({});
  });

  it('stores a binding back at its default as no override', () => {
    const overrides = withHotkey({}, 'assets', 'q');
    expect(overrides).toEqual({ assets: 'q' });
    expect(withHotkey(overrides, 'assets', DEFAULT_MAP_HOTKEYS.assets)).toEqual({});
    expect(withHotkey(overrides, 'help', '')).toEqual({ assets: 'q', help: '' });
  });

  it('lets a user binding win over a default that takes the same key', () => {
    const bindings = resolveHotkeys({ assets: 'v', timerReset: 'm' });
    expect(bindings.assets).toBe('v');
    expect(bindings.move).toBe('');
    expect(bindings.measure).toBe('m');
    expect(bindings.palette).toBe('Space');
  });
});

afterEach(() => { vi.useRealTimers(); });

describe('saved hotkeys', () => {
  it('saves only the bindings the user changed', async () => {
    const { app, files } = vault();
    const settings = new SettingsService(app);
    await settings.initialize();
    settings.setHotkey('assets', 'q');
    settings.setHotkey('help', '');
    await settings.saveSettingsNow();
    expect(savedHotkeys(files)).toEqual({ assets: 'q', help: '' });

    settings.setHotkey('assets', DEFAULT_MAP_HOTKEYS.assets);
    await settings.saveSettingsNow();
    expect(savedHotkeys(files)).toEqual({ help: '' });
  });

  it('rewrites files that saved every binding on load', async () => {
    vi.useFakeTimers();
    const { app, files } = vault({ hotkeys: { ...DEFAULT_MAP_HOTKEYS, assets: 'q' } });
    const settings = new SettingsService(app);
    await settings.initialize();
    await vi.runAllTimersAsync();
    expect(savedHotkeys(files)).toEqual({ assets: 'q' });
    expect(settings.getHotkeys()).toEqual({ ...DEFAULT_MAP_HOTKEYS, assets: 'q' });
  });
});
