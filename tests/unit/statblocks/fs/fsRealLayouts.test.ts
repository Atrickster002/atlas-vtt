/**
 * Fabian's own layouts, imported block by block: the Cairn bestiary layout
 * (released with the Cairn collection) and the Dolmenwood vault's statblock
 * layout. The fixtures are copies; where the originals are on this machine
 * they are read too (read only) and must still match.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fsLayoutToTemplate, isFsLayout } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import type { FsLayout } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import { expectParses, lostCode } from './fsCodeKit';
import { fieldOutline, outline } from './fsOutline';

const FIXTURES = join(__dirname, 'fixtures');
const CAIRN_ORIGINAL = join(homedir(), 'Github', 'atlas-vtt-cairn', 'fantasy-statblocks', 'Cairn.layout.json');
const DOLMENWOOD_SETTINGS = join(homedir(), 'Documents', 'Dolmenwood', '.obsidian', 'plugins', 'obsidian-5e-statblocks', 'data.json');

function readLayout(path: string): FsLayout {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isFsLayout(value)) throw new Error(`${path} holds no layout`);
  return value;
}

function dolmenwoodFromSettings(): FsLayout | undefined {
  const settings: unknown = JSON.parse(readFileSync(DOLMENWOOD_SETTINGS, 'utf8'));
  const layouts = typeof settings === 'object' && settings !== null && 'layouts' in settings ? settings.layouts : [];
  return Array.isArray(layouts) ? layouts.filter(isFsLayout).find((layout) => layout.id === 'dolmenwood-statblock-layout') : undefined;
}

const CAIRN = readLayout(join(FIXTURES, 'cairn.layout.json'));
const DOLMENWOOD = readLayout(join(FIXTURES, 'dolmenwood.layout.json'));

describe('the Cairn layout', () => {
  const { template, report } = fsLayoutToTemplate(CAIRN, { id: 'cairn-abc123' });

  it('imports block by block', () => {
    expect(outline(template.layout.blocks)).toEqual([
      'image image whenEmpty="hide"',
      'title title level=1 fallback="Creature"',
      'line type whenEmpty="hide"',
      'divider when type present',
      'section',
      '  stat hp whenEmpty="hide"',
      '  stat armor whenEmpty="hide"',
      'divider',
      'scores stats whenEmpty="hide"',
      'divider when stats present',
      'stat attacks whenEmpty="hide" extras=markdown',
      'divider when attacks present',
      'text description whenEmpty="hide" extras=markdown',
      'entries abilities whenEmpty="hide" extras=markdown',
      'stat critical_damage whenEmpty="hide" extras=markdown',
    ]);
    expect(fieldOutline(template.fields)).toEqual([
      'image: image "Image"', 'title: text "Title"', 'type: text "Type"', 'hp: text "HP"', 'armor: text "Armor"',
      'stats: scores "Abilities" [STR,DEX,WIL]', 'attacks: text "Attacks"', 'description: markdown "Description"',
      'abilities: entries "Abilities"', 'critical_damage: text "Critical Damage"',
    ]);
    expect(template.importedFrom).toEqual({ layoutId: 'cairn-bestiary-layout', layoutName: 'Cairn' });
  });

  it('shows every block in full and parses', () => {
    expect(report).toMatchObject({ blocks: 11, fields: 10, scripts: [], dropped: [], partial: [], withoutCode: { total: 11, full: 11 } });
    expectParses(template);
    expect(lostCode(CAIRN, template)).toEqual([]);
  });

  it.skipIf(!existsSync(CAIRN_ORIGINAL))('matches the layout the Cairn repository ships', () => {
    expect(readLayout(CAIRN_ORIGINAL)).toEqual(CAIRN);
  });
});

describe('the Dolmenwood layout', () => {
  const { template, report } = fsLayoutToTemplate(DOLMENWOOD, { id: 'dolmenwood-abc123' });

  it('imports block by block', () => {
    expect(outline(template.layout.blocks)).toEqual([
      'image image whenEmpty="hide"',
      'title name level=1 fallback="Creature"',
      'text groessetyp whenEmpty="hide" fallback="-" extras=markdown',
      'divider when groessetyp present',
      'entries statlines whenEmpty="hide" fallback="-" extras=markdown',
    ]);
    expect(fieldOutline(template.fields)).toEqual([
      'image: image "Image"', 'name: text "Name"', 'groessetyp: markdown "Groessetyp"', 'statlines: entries "Statlines"',
    ]);
    expect(template.layout).toMatchObject({ maxColumns: 1, columnWidth: 19 });
  });

  it('shows every block in full and parses', () => {
    expect(report).toMatchObject({ blocks: 4, fields: 4, scripts: [], dropped: [], partial: [], withoutCode: { total: 4, full: 4 } });
    expectParses(template);
  });

  it.skipIf(!existsSync(DOLMENWOOD_SETTINGS))('matches the layout in the Dolmenwood vault', () => {
    expect(dolmenwoodFromSettings()).toEqual(DOLMENWOOD);
  });
});
