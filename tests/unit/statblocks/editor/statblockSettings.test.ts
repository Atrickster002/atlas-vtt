import { describe, expect, it } from 'vitest';
import { SettingsService } from '../../../../src/app/services/SettingsService';
import { setStatblockPaneSettings, statblockPaneSettings } from '../../../../src/app/statblocks/editor/paneSettings';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

describe('the statblock pane\'s settings', () => {
  it('store whether the first-visit hint was dismissed, off by default', async () => {
    const { app } = createInMemoryApp();
    const settings = new SettingsService(app);
    expect(statblockPaneSettings(settings)).toEqual({ hintDismissed: false });
    setStatblockPaneSettings(settings, { hintDismissed: true });
    expect(statblockPaneSettings(settings)).toEqual({ hintDismissed: true });
    await settings.saveSettingsNow();
  });

  it('read anything but true as off', () => {
    const { app } = createInMemoryApp();
    const settings = new SettingsService(app);
    settings.setSetting('statblockPane', { hintDismissed: 1 } as never);
    expect(statblockPaneSettings(settings)).toEqual({ hintDismissed: false });
    return settings.saveSettingsNow();
  });
});
