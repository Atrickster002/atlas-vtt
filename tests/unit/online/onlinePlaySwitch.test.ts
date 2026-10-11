import type { Plugin } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { registerOnlinePlay } from '../../../src/app/plugin/onlinePlay';
import type { SettingsService } from '../../../src/app/services/SettingsService';

vi.mock('../../../src/app/online/gm/OnlineFeature.ts', () => ({
  OnlineFeature: class {
    settingsSections = (): unknown[] => [{ heading: 'Online account', rows: [] }];
    runCommand = (): boolean => true;
  },
}));

/** A plugin that records its children, and settings whose experimental switch the test flips. */
function host(): { plugin: Plugin; settings: SettingsService; children: Set<unknown>; commands: Map<string, (checking: boolean) => boolean>; flip(on: boolean): void } {
  const children = new Set<unknown>();
  const commands = new Map<string, (checking: boolean) => boolean>();
  let on = false;
  let changed = (): void => undefined;
  const plugin = {
    app: { vault: { adapter: {} } },
    register: (): void => undefined,
    addCommand: (command: { id: string; checkCallback: (checking: boolean) => boolean }): void => void commands.set(command.id, command.checkCallback),
    addChild: <T>(child: T): T => (children.add(child), child),
    removeChild: <T>(child: T): T => (children.delete(child), child),
  } as unknown as Plugin;
  const settings = {
    isExperimentalOn: (id: string): boolean => id === 'onlinePlay' && on,
    onChange: (listener: () => void): (() => void) => ((changed = listener), () => undefined),
  } as unknown as SettingsService;
  return { plugin, settings, children, commands, flip: (next) => ((on = next), changed()) };
}

describe('online play behind its experimental switch', () => {
  it('loads nothing and offers no settings while the switch is off', () => {
    const { plugin, settings, children } = host();
    const online = registerOnlinePlay(plugin, settings);
    expect(children.size).toBe(0);
    expect(online.settingsSections()).toEqual([]);
  });

  it('loads with the switch, once, and unloads when it goes off', () => {
    const { plugin, settings, children, flip } = host();
    const online = registerOnlinePlay(plugin, settings);
    flip(true);
    flip(true);
    expect(children.size).toBe(1);
    expect(online.settingsSections()).toHaveLength(1);
    flip(false);
    expect(children.size).toBe(0);
    expect(online.settingsSections()).toEqual([]);
  });

  it('registers its commands once and offers them only while it is loaded', () => {
    const { plugin, settings, commands, flip } = host();
    registerOnlinePlay(plugin, settings);
    const start = commands.get('start-online-table');
    expect(commands.size).toBe(6);
    expect(start?.(true)).toBe(false);
    flip(true);
    expect(start?.(true)).toBe(true);
    flip(false);
    flip(true);
    expect(commands.size).toBe(6);
    expect(commands.get('start-online-table')).toBe(start);
  });
});

describe("online play's timers across a switch off and on", () => {
  it('fire again after they were stopped', async () => {
    const { companionTimers, stopCompanionTimers } = await import('../../../src/app/online/gm/companionTimers.ts');
    const first = companionTimers();
    stopCompanionTimers();
    const second = companionTimers();
    expect(second).not.toBe(first);
    const fired = await new Promise<boolean>((resolve) => {
      second.setTimer(() => resolve(true), 1);
      setTimeout(() => resolve(false), 500);
    });
    stopCompanionTimers();
    expect(fired).toBe(true);
  });
});
