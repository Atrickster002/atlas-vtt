// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { blockAccess, playerAccess } from '../../../../src/app/online/gm/book/playerAccess';
import { renameFieldKey } from '../../../../src/app/statblocks/model/fieldOps';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';

const FIELDS: TemplateField[] = [
  ...MARSH_CREATURE.fields,
  { key: 'title', label: 'Known as', type: 'text', meaning: 'display-name' },
  { key: 'spells', label: 'Spells', type: 'spells' },
  { key: 'notes', label: 'GM notes', type: 'markdown' },
  { key: 'stress', label: 'Stress', type: 'number' },
  { key: 'bonus', label: 'Bonus actions', type: 'entries' },
  { key: 'portrait', label: 'Portrait', type: 'image' },
];
const template = (players?: StatblockTemplate['players']): StatblockTemplate => ({ ...MARSH_CREATURE, fields: FIELDS, ...(players && { players }) });
const tabs = (...lists: string[]): TemplateBlock => ({
  id: 'tabs0001', type: 'tabs', blocks: lists.map((field, index) => ({ id: `tab0000${index}`, type: 'section', heading: field, blocks: [{ id: `lst0000${index}`, type: 'entries', field }] })),
});

describe('what a player may do with a field of their own statblock', () => {
  it('lets them change every value and ability by default', () => {
    for (const key of ['speed', 'ac', 'hp', 'stats', 'languages', 'cr', 'size', 'notes', 'stress', 'actions', 'traits']) expect(playerAccess(template(), key), key).toBe('edit');
  });

  it('lets them only read a spell list, the name, the display name and pictures, or not see a spell list', () => {
    for (const key of ['spells', 'name', 'title', 'image', 'portrait']) expect(playerAccess(template(), key), key).toBe('read');
    expect(playerAccess(template({ spells: 'edit' }), 'spells')).toBe('read');
    expect(playerAccess(template({ spells: 'hidden' }), 'spells')).toBe('hidden');
    expect(playerAccess(template({ name: 'edit', title: 'hidden', image: 'hidden' }), 'name')).toBe('read');
    expect(playerAccess(template({ name: 'edit', title: 'hidden', image: 'hidden' }), 'title')).toBe('read');
    expect(playerAccess(template({ image: 'hidden' }), 'image')).toBe('read');
  });

  it('follows what the template sets, and hides what the template names nowhere', () => {
    const set = template({ notes: 'hidden', speed: 'read', actions: 'read' });
    expect(playerAccess(set, 'notes')).toBe('hidden');
    expect(playerAccess(set, 'speed')).toBe('read');
    expect(playerAccess(set, 'actions')).toBe('read');
    expect(playerAccess(set, 'ac')).toBe('edit');
    expect(playerAccess(set, 'secret')).toBe('hidden');
  });

  it('keeps a setting across a rename, read by the new key and the old one', () => {
    const renamed = renameFieldKey(template({ notes: 'hidden' }), 'notes', 'gm_notes');
    expect(renamed.players).toEqual({ gm_notes: 'hidden' });
    expect(playerAccess(renamed, 'gm_notes')).toBe('hidden');
    expect(playerAccess(renamed, 'notes')).toBe('hidden');
    const stale: StatblockTemplate = { ...renamed, players: { notes: 'read' } };
    expect(playerAccess(stale, 'gm_notes')).toBe('read');
  });
});

describe('what a player may do with what a block shows', () => {
  it('sets an Abilities component for all its lists at once, the strictest deciding', () => {
    expect(blockAccess(template(), tabs('actions', 'bonus'))).toBe('edit');
    expect(blockAccess(template({ bonus: 'read' }), tabs('actions', 'bonus'))).toBe('read');
    expect(blockAccess(template({ bonus: 'hidden', actions: 'read' }), tabs('actions', 'bonus'))).toBe('hidden');
    expect(blockAccess(template({ actions: 'read' }), { id: 'e1', type: 'entries', field: 'actions' })).toBe('read');
  });

  it('reads a track bound to a resource, and lets a player change one that is not', () => {
    expect(blockAccess(template(), { id: 't1', type: 'track', field: 'stress', look: 'boxes', counts: 'up' })).toBe('edit');
    expect(blockAccess(template(), { id: 't1', type: 'track', field: 'stress', look: 'boxes', counts: 'up', resource: 'stress' })).toBe('read');
    expect(blockAccess(template({ stress: 'hidden' }), { id: 't1', type: 'track', field: 'stress', look: 'boxes', counts: 'up', resource: 'stress' })).toBe('hidden');
  });

  it('reads a line of several values, hidden where one of them is, and a metric shows while one number does', () => {
    const line: TemplateBlock = { id: 'l1', type: 'line', fields: ['size', 'type'], pattern: '{size} {type}' };
    expect(blockAccess(template(), line)).toBe('read');
    expect(blockAccess(template({ type: 'hidden' }), line)).toBe('hidden');
    expect(blockAccess(template(), { id: 'l2', type: 'line', fields: ['size'] })).toBe('edit');
    const metric: TemplateBlock = { id: 'm1', type: 'metric', fields: ['ac', 'stress', ''] };
    expect(blockAccess(template({ ac: 'hidden' }), metric)).toBe('edit');
    expect(blockAccess(template({ ac: 'hidden', stress: 'hidden' }), metric)).toBe('hidden');
  });

  it('never offers code or blocks of a newer Atlas, and only reads containers and fixed text', () => {
    expect(blockAccess(template(), { id: 's1', type: 'script', summary: 'x', fs: {} })).toBe('hidden');
    expect(blockAccess(template(), { id: 'o1', type: 'opaque', raw: {} })).toBe('hidden');
    expect(blockAccess(template(), { id: 'x1', type: 'text', text: 'Fixed words' })).toBe('read');
    expect(blockAccess(template(), { id: 'd1', type: 'divider' })).toBe('read');
    expect(blockAccess(template({ notes: 'hidden' }), { id: 'x2', type: 'text', field: 'notes' })).toBe('hidden');
  });
});
