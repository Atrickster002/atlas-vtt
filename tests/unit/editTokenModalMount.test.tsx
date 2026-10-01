import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { senseWithRole } from '../../src/app/gameSystems/senseRules';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import type { TokenEntity } from '../../src/app/types';
import type { TokenSense } from '../../src/app/types/senseTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const darkvision = senseWithRole(GENERIC_SENSES, 'darkvision');
const tremorsense = senseWithRole(GENERIC_SENSES, 'tremorsense');

// Cancel unmounts the modal's root and removes its container.
afterEach(() => {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) act(() => cancel.click());
});

function open(overrides: Partial<TokenEntity> = {}, inheritedSenses?: TokenSense[]): { store: ViewAtlasStore; saved: () => TokenEntity } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `edit-token-${Math.random()}`);
  const token: TokenEntity = { id: 't', kind: 'token', imagePath: 't.png', x: 0, y: 0, ...overrides };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
  act(() => openEditTokenModal(token, store, app, inheritedSenses && { inheritedSenses }));
  return { store, saved: () => store.getState().objects.tokens.t! };
}

const save = (): void => act(() => screen.getByRole('button', { name: 'Save' }).click());
const vision = (): HTMLElement => screen.getByRole('switch', { name: 'Vision (party member)' });

describe('openEditTokenModal', () => {
  it('opens with its vision switch through its own React root, outside every tooltip provider', () => {
    open({ vision: { enabled: true } });
    expect(vision().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Vision & light')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Cancel' }).click());
    expect(document.body.querySelector('.atlas-vtt-root')).toBeNull();
  });

  it('says in one line what the vision switch means', () => {
    open();
    expect(screen.getByText('Players see what this token sees, and always see the token.')).toBeTruthy();
    expect(vision().getAttribute('aria-describedby')).toBe(screen.getByText('Players see what this token sees, and always see the token.').id);
  });

  it('shows sight range, angle and senses only for a token with vision', () => {
    open();
    expect(screen.queryByLabelText(/^Sight range/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Senses' })).toBeNull();
    fireEvent.click(vision());
    expect(screen.getByLabelText(/^Sight range/)).toBeTruthy();
    expect(screen.getByLabelText(/^Vision angle/)).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Senses' })).toBeTruthy();
    expect(screen.queryByLabelText(/^Darkvision \(/)).toBeNull();
  });

  it('shows an old token\'s darkvision and tremorsense as senses and saves them as senses', () => {
    const { saved } = open({ vision: { enabled: true, range: 120, darkvision: 60, tremorsense: 10 } });
    expect((screen.getByLabelText('Darkvision range') as HTMLInputElement).value).toBe('60');
    expect((screen.getByLabelText('Tremorsense range') as HTMLInputElement).value).toBe('10');
    save();
    expect(saved().vision).toEqual({ enabled: true, range: 120, senses: [{ id: darkvision.id, range: 60 }, { id: tremorsense.id, range: 10 }] });
  });

  it('adds a sense with its range and saves it', () => {
    const { saved } = open({ vision: { enabled: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Add sense' }));
    fireEvent.click(screen.getByRole('button', { name: /^Darkvision/ }));
    fireEvent.change(screen.getByLabelText('Darkvision range'), { target: { value: '60' } });
    save();
    expect(saved().vision).toEqual({ enabled: true, senses: [{ id: darkvision.id, range: 60 }] });
  });

  it('keeps what is set while vision is switched off', () => {
    const { saved } = open({ vision: { enabled: true, range: 30, senses: [{ id: darkvision.id, range: 60 }] } });
    fireEvent.click(vision());
    save();
    expect(saved().vision).toEqual({ enabled: false, range: 30, senses: [{ id: darkvision.id, range: 60 }] });
  });

  it('shows the statblock\'s senses marked, and saves none while they are not edited', () => {
    const { saved } = open({ vision: { enabled: true } }, [{ id: darkvision.id, range: 60 }]);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Darkvision')).toBeTruthy();
    expect(within(row).getByText('from statblock')).toBeTruthy();
    save();
    expect(saved().vision).toEqual({ enabled: true });
  });

  it('copies the statblock\'s senses onto the token once they are edited', () => {
    const { saved } = open({ vision: { enabled: true } }, [{ id: darkvision.id, range: 60 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit senses' }));
    fireEvent.change(screen.getByLabelText('Darkvision range'), { target: { value: '90' } });
    save();
    expect(saved().vision).toEqual({ enabled: true, senses: [{ id: darkvision.id, range: 90 }] });
  });

  it('closes on Escape, but not when a control inside took the key', () => {
    open({ vision: { enabled: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Add sense' }));
    fireEvent.keyDown(screen.getByRole('group', { name: 'Senses to add' }), { key: 'Escape' });
    expect(screen.getByText('Vision & light')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Senses to add' })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByText('Vision & light')).toBeNull();
  });
});
