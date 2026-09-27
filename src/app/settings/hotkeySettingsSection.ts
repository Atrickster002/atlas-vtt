import { Notice, type Setting, type ToggleComponent } from 'obsidian';
import { availableHotkeys, DEFAULT_MAP_HOTKEYS, formatHotkey, hotkeyFromEvent } from '../keyboard/mapHotkeys';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingRow, AtlasSettingSection } from './settingSections';
import type { ButtonComponent } from 'obsidian';
import { TUTORIAL_IDS } from '../services/SettingsService';

type HotkeyAction = ReturnType<typeof availableHotkeys>[number];

function notifyFailure(error: unknown, fallback: string): void {
  new Notice(error instanceof Error ? error.message : fallback);
}

/** Map shortcut recorder rows plus the "reset all" row that refreshes them. */
export function hotkeySettingsSection(settings: SettingsService): AtlasSettingSection {
  // Each rendered row registers a callback that re-reads its binding, so
  // "reset all" can refresh every recorder without re-rendering the tab.
  const rowSyncs = new Set<() => void>();

  const hotkeyRow = (action: HotkeyAction): AtlasSettingRow => ({
    name: action.label,
    desc: action.group,
    aliases: ['hotkey', 'shortcut'],
    render: (setting: Setting) => {
      let input: HTMLInputElement | undefined;
      const sync = (): void => {
        if (input) input.value = formatHotkey(settings.getHotkeys()[action.id]);
      };

      setting.addText(text => {
        input = text.inputEl;
        const recorder = text.inputEl;
        sync();
        recorder.readOnly = true;
        recorder.classList.add('atlas-hotkey-recorder');
        recorder.setAttribute('aria-label', `Shortcut for ${action.label}`);
        recorder.addEventListener('focus', () => { recorder.value = 'Press a key…'; });
        recorder.addEventListener('blur', sync);
        recorder.addEventListener('keydown', event => {
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') { recorder.blur(); return; }
          if (event.repeat) return;
          const binding = hotkeyFromEvent(event);
          if (!binding) return;
          try { settings.setHotkey(action.id, binding); recorder.blur(); }
          catch (error) { notifyFailure(error, 'Could not assign shortcut'); }
        });
      });
      setting.addExtraButton(button => button.setIcon('x').setTooltip('Clear shortcut').onClick(() => {
        settings.setHotkey(action.id, ''); sync();
      }));
      setting.addExtraButton(button => button.setIcon('reset').setTooltip('Restore default').onClick(() => {
        try { settings.setHotkey(action.id, DEFAULT_MAP_HOTKEYS[action.id]); sync(); }
        catch (error) { notifyFailure(error, 'Could not restore shortcut'); }
      }));

      rowSyncs.add(sync);
      return () => { rowSyncs.delete(sync); };
    },
  });

  return {
    heading: 'Map hotkeys',
    rows: [
      {
        name: 'Single keys and combinations',
        desc: 'These shortcuts work only in the active map, outside text fields and dialogs. Select a shortcut field and press a key or combination. Escape cancels recording. Clear a binding before assigning its key to another action.',
        aliases: ['hotkey', 'shortcut', 'reset'],
        render: (setting) => {
          setting.addButton(button => button.setButtonText('Reset all hotkeys').onClick(() => {
            settings.resetHotkeys();
            rowSyncs.forEach(sync => sync());
          }));
        },
      },
      ...availableHotkeys().map(hotkeyRow),
    ],
  };
}

/** How far the user is through the tutorials, for the Reset row. */
function tutorialProgress(settings: SettingsService): string {
  const finished = settings.finishedTutorialCount();
  if (finished === 0) return 'Each tutorial shows the first time you open its feature.';
  return `You finished or skipped ${finished} of ${TUTORIAL_IDS.length} tutorials; they stay hidden. Reset them to see each again the next time you open its feature.`;
}

/**
 * Tutorials: whether they show at all, and resetting the ones the user
 * finished or skipped. A tutorial finished, skipped or dismissed with Escape
 * never shows again until it is reset here.
 */
export function onboardingSettingsSection(settings: SettingsService): AtlasSettingSection {
  let tutorialToggle: ToggleComponent | undefined;
  return {
    heading: 'Getting started',
    rows: [
      {
        name: 'Show tutorials',
        desc: 'Short guided tours of the asset manager, the command palette, token statblocks and loot, each shown once.',
        aliases: ['onboarding', 'walkthrough', 'tour'],
        render: (setting) => {
          setting.addToggle(toggle => {
            tutorialToggle = toggle;
            toggle.setValue(settings.getSetting('onboarding').enabled).onChange(enabled => {
              settings.setSetting('onboarding', { ...settings.getSetting('onboarding'), enabled });
            });
          });
        },
      },
      {
        name: 'Reset tutorials',
        desc: 'Show every tutorial again the next time you open its feature.',
        aliases: ['onboarding', 'walkthrough', 'tour', 'replay'],
        render: (setting) => {
          let button: ButtonComponent | undefined;
          setting.addButton(component => {
            button = component;
            component.setButtonText('Reset tutorials').onClick(() => {
              settings.resetTutorials();
              tutorialToggle?.setValue(true);
              new Notice('Tutorials will show again the next time you open each feature.');
            });
          });
          const sync = (): void => {
            setting.setDesc(tutorialProgress(settings));
            button?.setDisabled(settings.finishedTutorialCount() === 0);
          };
          sync();
          return settings.onChange(sync);
        },
      },
    ],
  };
}
