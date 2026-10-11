import type { AtlasSettingSection } from '../../settings/settingSections';
import type { AccountControl } from './account/AccountControl.ts';
import { accountSections } from './account/accountSettings.ts';
import { COMPANION_REPORTS_NOTE } from './companionReports.ts';

export interface OnlineSettings {
  /** The owner's key that creates tables without an account; empty for everyone else. */
  createKey: string;
  /** Whether this plugin's errors are reported to the server; off until the GM switches it on. */
  reportErrors: boolean;
}

export const DEFAULT_SETTINGS: OnlineSettings = { createKey: '', reportErrors: false };

/** Settings read from the plugin's data, each field checked. */
export function readSettings(data: unknown): OnlineSettings {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  return {
    createKey: typeof record.createKey === 'string' ? record.createKey : DEFAULT_SETTINGS.createKey,
    reportErrors: record.reportErrors === true,
  };
}

/** What online play's settings rows read and change. */
export interface OnlineSettingsHost {
  readonly settings: OnlineSettings;
  readonly account: AccountControl;
  saveSettings(): Promise<void>;
}

/** Online play's sections of Atlas's settings: the account, the GM's online data, error reports and the owner's create key. */
export function onlineSettingsSections(host: OnlineSettingsHost): AtlasSettingSection[] {
  const save = async (change: (settings: OnlineSettings) => void): Promise<void> => {
    change(host.settings);
    await host.saveSettings();
  };
  const settings = host.settings;
  const sections: AtlasSettingSection[] = [
    ...accountSections(host.account),
    {
      heading: 'Online diagnostics',
      rows: [{
        name: 'Send error reports',
        desc: COMPANION_REPORTS_NOTE,
        render: (setting) => {
          setting.addToggle((toggle) => toggle.setValue(settings.reportErrors).onChange((value) => void save((current) => (current.reportErrors = value))));
        },
      }],
    },
  ];
  // The owner's key shows only while it is set: everyone else hosts with an account.
  if (settings.createKey !== '') {
    sections.push({
      heading: 'Online hosting',
      rows: [{
        name: 'Create key',
        desc: 'Creates tables without an account. Clear it to host with your account.',
        render: (setting) => {
          setting.addText((field) => {
            field.inputEl.type = 'password';
            field.setValue(settings.createKey).onChange((next) => void save((current) => (current.createKey = next.trim())));
          });
        },
      }],
    });
  }
  return sections;
}
