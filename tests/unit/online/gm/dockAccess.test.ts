import { describe, expect, it, vi } from 'vitest';
import type { AccountView } from '../../../../src/app/online/gm/account/accountView.ts';
import { ACCESS_REFUSALS } from '../../../../src/app/online/gm/account/relayAccount.ts';
import { renderMenu, type MenuActions } from '../../../../src/app/online/gm/dock/ConnectionMenu.ts';
import { menuModel, type OnlineSnapshot, type SceneFacts } from '../../../../src/app/online/gm/dock/panelModel.ts';

const MARA = { id: 'acc_mara', handle: 'mara', name: 'Mara' };
const CAN_HOST: AccountView = { kind: 'can-host', account: MARA, access: { plan: 'beta', maxPlayers: 12, endsAt: null } };
const SCENE: SceneFacts = { isShared: true, tokens: {}, selected: [] };

const snapshot = (over: Partial<OnlineSnapshot> = {}): OnlineSnapshot => ({ status: 'idle', link: null, sharedLeaf: null, sharedName: null, sharedTokens: {}, players: [], playerTokens: [], seats: null, gate: null, ...over });

function actions(): MenuActions & { openAccountPage: ReturnType<typeof vi.fn<() => void>> } {
  return {
    start: vi.fn(), openSettings: vi.fn(), signIn: vi.fn(), cancelSignIn: vi.fn(), reopenSignIn: vi.fn(), signOut: vi.fn(), retry: vi.fn(), openAccountPage: vi.fn<() => void>(),
    newCode: vi.fn(), setRequireCode: vi.fn(), setAskToJoin: vi.fn(), copyCode: () => Promise.resolve(true), hideImage: vi.fn(),
    stop: vi.fn(), share: vi.fn(), copy: () => Promise.resolve(true), toggleQr: vi.fn(),
  };
}

/** The menu as the GM reads it: its lines of text, and its buttons by their words. */
function menu(over: Partial<OnlineSnapshot>, account: AccountView): { lines: string[]; buttons: string[]; press(text: string): void; layer: HTMLElement; does: ReturnType<typeof actions> } {
  const layer = document.body.createDiv();
  const does = actions();
  renderMenu(layer, menuModel(snapshot(over), SCENE, account), does);
  const buttons = [...layer.querySelectorAll('button')];
  return {
    layer,
    does,
    lines: [...layer.querySelectorAll('.atlas-online-title, .atlas-online-help, .atlas-online-status__text')].map((line) => line.textContent ?? ''),
    buttons: buttons.map((button) => button.textContent ?? '').filter((text) => text !== ''),
    press: (text) => buttons.find((button) => button.textContent === text)?.click(),
  };
}

describe('the online menu before a table runs', () => {
  it('asks a signed-out GM to sign in, and offers nothing that takes a key', () => {
    const shown = menu({}, { kind: 'signed-out', notice: null });
    expect(shown.lines).toEqual(['Online play', 'Players see this map in their browsers and move their own tokens.', 'Use your Atlas account to host tables.']);
    expect(shown.buttons).toEqual(['Sign in to host']);
    expect(shown.layer.querySelector('input, form')).toBeNull();
  });

  it('says for each reason why the account may not host, and opens the account page, with no field for a key', () => {
    const sentences: Record<string, string> = {
      'no-access': 'Online play is in early access. Redeem an invite key on your account page.',
      'access-ended': 'Your access to online play has ended. See your account page.',
      'access-revoked': 'Your access to online play was withdrawn. See your account page.',
      'account-restricted': 'Your account is restricted and cannot host online tables. See your account page.',
      'terms-not-accepted': 'Accept the current Terms on your account page to host online tables.',
    };
    for (const reason of ACCESS_REFUSALS) {
      const shown = menu({}, { kind: 'no-access', account: MARA, reason });
      expect(shown.lines, reason).toEqual(['Online play', sentences[reason], 'Signed in as Mara (@mara)']);
      expect(shown.buttons, reason).toEqual(['Open account page', 'Sign out']);
      expect(shown.layer.querySelector('input, form'), reason).toBeNull();
      shown.press('Open account page');
      expect(shown.does.openAccountPage).toHaveBeenCalledTimes(1);
      expect(shown.does.start).not.toHaveBeenCalled();
    }
    expect(menu({}, { kind: 'no-access', account: MARA, reason: null }).lines[1]).toBe('This account may not host online tables now. See your account page.');
  });

  it('offers Start to an account the relay says may host, with its plan', () => {
    const shown = menu({}, CAN_HOST);
    expect(shown.lines).toEqual(['Online play', 'Players see this map in their browsers and move their own tokens.', 'Early access · up to 12 players', 'Signed in as Mara (@mara)']);
    expect(shown.buttons).toEqual(['Sign out', 'Start online table']);
    shown.press('Start online table');
    expect(shown.does.start).toHaveBeenCalledTimes(1);
  });
});
