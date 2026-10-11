import { Notice, type ButtonComponent, type Setting } from 'obsidian';
import type { AtlasSettingSection } from '../../../settings/settingSections';
import { ACCOUNT_PAGE_URL } from '../servers.ts';
import type { AccountControl } from './AccountControl.ts';
import { accountText, planText, type AccountView } from './accountView.ts';

/** What the account row says. */
function accountDesc(view: AccountView): string {
  switch (view.kind) {
    case 'owner': return 'The create key hosts tables without an account.';
    case 'waiting': return 'Approve the sign-in in your browser.';
    case 'checking': return 'Checking your account…';
    case 'unreachable': return 'Can’t reach Atlas sign-in right now.';
    case 'no-access': return `Signed in as ${accountText(view.account)}. Online play is in early access: redeem an invite key in the online menu on a map.`;
    case 'can-host': return `Signed in as ${accountText(view.account)} · ${planText(view.access)}`;
    default: return 'Not signed in. Sign in to host online tables with your Atlas account.';
  }
}

const signedIn = (view: AccountView): boolean => view.kind === 'no-access' || view.kind === 'can-host' || view.kind === 'unreachable' || view.kind === 'checking';

/** Saves text as a file through the browser's download, which Obsidian hands to the system. */
function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = activeDocument.body.createEl('a', { attr: { href: url, download: name } });
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The settings' Account and Online data sections. */
export function accountSections(account: AccountControl): AtlasSettingSection[] {
  // A row is drawn from the account as it is now and again whenever it changes, while the settings are open.
  const follow = (draw: (view: AccountView) => void): (() => void) => {
    draw(account.view());
    return account.onChange(() => draw(account.view()));
  };
  // A button that works only while the GM is signed in; `build` sets it up like a callback of `addButton`.
  const signedInButton = (setting: Setting, build: (button: ButtonComponent) => unknown): (() => void) => {
    let stop = (): void => undefined;
    setting.addButton((button) => {
      build(button);
      stop = follow((view) => {
        button.setDisabled(!signedIn(view));
      });
    });
    return stop;
  };
  return [
    {
      heading: 'Online account',
      rows: [{
        name: 'Atlas account',
        desc: accountDesc(account.view()),
        render: (setting) => follow((view) => {
          setting.setDesc(accountDesc(view));
          setting.clear();
          if (signedIn(view)) setting.addButton((button) => button.setButtonText('Sign out').onClick(() => void account.signOut()));
          else if (view.kind === 'signed-out') setting.addButton((button) => button.setButtonText('Sign in').setCta().onClick(() => void account.signIn()));
          else if (view.kind === 'waiting') setting.addButton((button) => button.setButtonText('Cancel').onClick(() => account.cancelSignIn()));
          setting.addButton((button) => button.setButtonText('Open account page').onClick(() => window.open(ACCOUNT_PAGE_URL)));
        }),
      }],
    },
    {
      heading: 'Online data',
      rows: [
        {
          name: 'Download your online data',
          desc: 'Your access, redeemed invite keys and hosted tables, as the table server keeps them.',
          render: (setting) => signedInButton(setting, (button) => button.setButtonText('Download').onClick(async () => {
            const text = await account.exportData();
            if (text !== null) download(text, 'atlas-online-data.json');
          })),
        },
        {
          name: 'Delete your online data',
          desc: 'Deletes it on the table server. Your early access ends with it; running tables keep going.',
          render: (setting) => {
            let armed = false;
            return signedInButton(setting, (button) => button.setButtonText('Delete').onClick(async () => {
              if (!armed) {
                armed = true;
                button.setButtonText('Delete for good');
                button.buttonEl.addClass('mod-warning');
                return;
              }
              if (await account.deleteData()) new Notice('Your online data was deleted.');
            }));
          },
        },
      ],
    },
  ];
}
