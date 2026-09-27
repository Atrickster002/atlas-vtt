import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';

describe('SettingsService startup', () => {
  it('reads the settings file only once the startup migration has put it in place', async () => {
    let finishMigration!: () => void;
    const storageReady = new Promise<void>((resolve) => { finishMigration = resolve; });
    const read = vi.fn(async () => JSON.stringify({ navigation: { inputMode: 'trackpad' } }));
    const app = { vault: { adapter: { exists: async () => true, read } } };

    const settings = new SettingsService(app as never, storageReady);
    // A map tab restored during startup initialises the shared service early.
    const loading = settings.initialize();
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();
    expect(SettingsService.forApp(app as never)).toBe(settings);

    finishMigration();
    await loading;
    expect(read).toHaveBeenCalledOnce();
    expect(settings.getNavigationSettings().inputMode).toBe('trackpad');
  });

  it('still loads the settings when the migration failed', async () => {
    const app = { vault: { adapter: { exists: async () => true, read: async () => JSON.stringify({ navigation: { inputMode: 'trackpad' } }) } } };
    const settings = new SettingsService(app as never, Promise.reject(new Error('migration failed')));
    await settings.initialize();
    expect(settings.getNavigationSettings().inputMode).toBe('trackpad');
  });
});
