import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { templateHasCode } from '../../../../src/app/statblocks/format/templateCode';
import { fsLayoutToTemplate, isFsLayout } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import type { FsLayout, FsLayoutResolver } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import { stripCode } from '../../../../src/app/statblocks/model/fsCodeKeys';
import { expectParses, lostCode } from './fsCodeKit';
import { fieldOutline, outline } from './fsOutline';
import { BEAST_LAYOUT, FOOTER_LAYOUT, LOOP_LAYOUTS, RAN_MARKER, fanOutLayouts } from './fixtures/syntheticLayouts';

const ID = 'synthetic-beast-abc123';

function resolverOf(layouts: readonly FsLayout[]): FsLayoutResolver {
  return (idOrName) => layouts.find((layout) => layout.id === idOrName || layout.name === idOrName) ?? null;
}

function convertBeast(): ReturnType<typeof fsLayoutToTemplate> {
  return fsLayoutToTemplate(BEAST_LAYOUT, { id: ID, resolveLayout: resolverOf([FOOTER_LAYOUT]) });
}

/** A value from outside TypeScript, checked the way an import checks a picked file. */
function layoutFrom(value: unknown): FsLayout {
  if (!isFsLayout(value)) throw new Error('not a layout');
  return value;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, RAN_MARKER);
});

describe('fsLayoutToTemplate on a synthetic layout', () => {
  it('maps every block, in order, onto the template’s blocks', () => {
    expect(outline(convertBeast().template.layout.blocks)).toEqual([
      'row align="spread"',
      '  section whenEmpty="hide"',
      '    row align="spread"',
      '      title name level=1 whenEmpty="hide"',
      '      section',
      '        row align="spread" extras=hasRule',
      '          script summary="A button that runs JavaScript"',
      '          script summary="A button that runs an Obsidian command"',
      '    line size,kind,alignment separator=", " whenEmpty="hide"',
      '  image portrait whenEmpty="hide"',
      'divider',
      'section whenEmpty="hide"',
      '  stat armor pattern="{armor}[ ({armor_note})]" when armor present whenEmpty="hide"',
      '  stat vitality pattern="{vitality} ({vitality_dice})" rollFrom="vitality_dice" when vitality present whenEmpty="hide" extras=dice,diceCallback',
      '  stat pace whenEmpty="hide"',
      'divider',
      'scores scores column="floor((value - 10) / 2)" whenEmpty="hide"',
      'divider when scores present',
      'scores knacks column="floor(value / 3)"',
      'scores omens extras=calculate,modifier',
      'section',
      '  pairs resists display="signed" whenEmpty="hide"',
      '  script summary="Talents formatted by JavaScript"',
      'stat level display="signed" whenEmpty="hide"',
      'stat rank pattern="{rank} {role}" when rank present whenEmpty="hide"',
      'stat languages whenEmpty="fallback" fallback="None"',
      'stat aura label="Aura:" whenEmpty="fallback" fallback="-" cls="glow" extras=doNotAddClass,markdown',
      'entries features heading="Features" whenEmpty="hide"',
      'entries moves heading="Moves" whenEmpty="hide" extras=dice,subheadingText',
      'script summary="Gambits formatted by JavaScript"',
      'section headingField="lore_title"',
      '  entries lore whenEmpty="hide"',
      'spells spells heading="Spells" whenEmpty="hide"',
      'text notes heading="Notes" whenEmpty="hide" extras=markdown',
      'heading text="Tactics" level="section"',
      'text text="Flees at half health."',
      'section heading="Secrets" collapsible="closed"',
      '  text secrets whenEmpty="hide" extras=markdown',
      'divider',
      'section',
      '  stat source whenEmpty="hide"',
      'script summary="One of 2 parts, chosen by JavaScript"',
      'script summary="Hit points and Wounds tracks drawn with JavaScript"',
      'script summary="JavaScript reading motto"',
      'stat initiative whenEmpty="fallback" fallback="-" extras=customFlag',
      'section headingField="group_title" cls="titled"',
      '  title epithet level=3 extras=size',
    ]);
  });

  it('makes a field of every key the blocks name, typed by the block and labelled from it', () => {
    expect(fieldOutline(convertBeast().template.fields)).toEqual([
      'name: text "Name"', 'kind: text "Kind"', 'size: text "Size"', 'alignment: text "Alignment"', 'portrait: image "Portrait"',
      'armor: text "Armor"', 'vitality: text "Vitality"', 'pace: text "Pace"', 'armor_note: text "Armor note"',
      'vitality_dice: dice "Vitality dice"', 'scores: scores "Scores" [Might,Grace,Wits]', 'knacks: scores "Knacks" [Hunt,Hide]',
      'omens: scores "Omens" [Sky]', 'resists: pairs "Resists"', 'talents: pairs "Talents"', 'level: number "Level"',
      'rank: text "Rank"', 'role: text "Role"', 'languages: text "Languages"', 'aura: text "Aura"',
      'features: entries "Features" text=text', 'moves: entries "Moves"', 'gambits: entries "Gambits"',
      'lore_title: text "Lore title"', 'lore: entries "Lore"', 'spells: spells "Spells"', 'notes: markdown "Notes"',
      'secrets: markdown "Secrets"', 'source: text "Source"', 'phase: text "Phase"', 'minions: entries "Minions"',
      'initiative: text "Initiative"', 'group_title: text "Group title"', 'epithet: text "Epithet"',
    ]);
  });

  it('reports scripts, suggestions, what was left out and what shows in part', () => {
    const { template, report } = convertBeast();
    expect(report.blocks).toBe(35);
    expect(report.fields).toBe(template.fields.length);
    expect(report.scripts.map(({ summary, suggestion }) => [summary, suggestion])).toEqual([
      ['A button that runs JavaScript', null],
      ['A button that runs an Obsidian command', null],
      ['Talents formatted by JavaScript', null],
      ['Gambits formatted by JavaScript', null],
      ['One of 2 parts, chosen by JavaScript', null],
      ['Hit points and Wounds tracks drawn with JavaScript', 'track'],
      ['JavaScript reading motto', null],
    ]);
    const scriptIds = template.layout.blocks.flatMap(function ids(block): string[] {
      if (block.type === 'script') return [block.id];
      return block.type === 'section' || block.type === 'row' ? block.blocks.flatMap(ids) : [];
    });
    expect(report.scripts.map((note) => note.blockId).sort()).toEqual(scriptIds.sort());
    expect(report.dropped).toEqual([
      'The included layout "nowhere" was not found, so its blocks were left out.',
      'The key "token" is reserved in Atlas, so the block that shows it was left out.',
      'The layout has 4 columns; Atlas shows at most 3.',
    ]);
    expect(report.partial).toEqual([
      'Omens: the modifiers are worked out by JavaScript, so Atlas shows the scores without them.',
      'Moves: the line under its heading is kept for export only.',
    ]);
    // The command button, the missing layout, the reserved key and the line under Moves
    expect(report.withoutCode).toEqual({ total: 31, full: 27 });
  });

  it('keeps the layout-level keys it does not model, and maps its columns', () => {
    const { template } = convertBeast();
    expect(template.importedFrom).toEqual({
      layoutId: 'synthetic-beast',
      layoutName: 'Synthetic beast',
      extras: { forceColumns: true, cssProperties: BEAST_LAYOUT.cssProperties, diceParsing: BEAST_LAYOUT.diceParsing },
    });
    expect(template.layout.maxColumns).toBe(3);
    expect(template.layout.columnWidth).toBe(20);
  });

  it('parses, keeps every piece of JavaScript it did not express, and never runs any', () => {
    const { template } = convertBeast();
    expectParses(template);
    expect(lostCode(BEAST_LAYOUT, template)).toEqual([]);
    expect(templateHasCode(template)).toBe(true);
    expectParses(stripCode(template));
    expect(Reflect.has(globalThis, RAN_MARKER)).toBe(false);
  });

  it('gives the same template for the same layout', () => {
    expect(convertBeast()).toEqual(convertBeast());
  });
});

describe('included layouts', () => {
  it('stops a layout that includes itself', () => {
    const [first] = LOOP_LAYOUTS;
    if (!first) throw new Error('fixture');
    const { template, report } = fsLayoutToTemplate(first, { id: ID, resolveLayout: resolverOf(LOOP_LAYOUTS) });
    expect(outline(template.layout.blocks)).toEqual(['stat alpha whenEmpty="fallback" fallback="-"', 'section', '  stat beta whenEmpty="fallback" fallback="-"']);
    expect(report.dropped).toEqual(['The layout "Loop A" includes itself, so the repeat was left out.']);
    expectParses(template);
  });

  it('leaves out what a layout includes past the block budget', () => {
    const layouts = fanOutLayouts(5);
    const [top] = layouts;
    if (!top) throw new Error('fixture');
    const { template, report } = fsLayoutToTemplate(top, { id: ID, resolveLayout: resolverOf(layouts) });
    expect(report.dropped).toContain('The layout is too large, so its last blocks were left out.');
    expect(report.blocks).toBeLessThanOrEqual(2000);
    expectParses(template);
  });

  it('leaves included layouts out without a resolver', () => {
    const { template, report } = fsLayoutToTemplate(BEAST_LAYOUT, { id: ID });
    expect(outline(template.layout.blocks)).not.toContain('  stat source whenEmpty="hide"');
    expect(report.dropped).toContain('The included layout "synthetic-footer" was not found, so its blocks were left out.');
  });
});

describe('untrusted layouts', () => {
  const hostile: Record<string, unknown> = {
    'blocks that are no list': { name: 'X', blocks: [], extra: { blocks: 'nope' } },
    'items that are no blocks': { name: 'X', blocks: [null, 3, 'text', [], { type: 7 }, {}] },
    'types that name prototype members': { name: 'X', blocks: [{ type: '__proto__' }, { type: 'constructor', properties: ['a'] }, { type: 'toString' }] },
    'keys that are no lists or text': { name: 'X', blocks: [{ type: 'property', properties: 'hp' }, { type: 'table', properties: [1, null, 'stats'], headers: 'x' }] },
    'fields named like prototype members': { name: 'X', blocks: [{ type: 'property', properties: ['__proto__'] }, { type: 'traits', properties: ['constructor'] }] },
    'keys a pattern must escape': { name: 'X', blocks: [{ type: 'property', properties: ['a,b'], callback: 'return monster["a,b"] + " {x} [y] |z|";' }] },
    'nesting far too deep': { name: 'X', blocks: [Array.from({ length: 60 }).reduce<Record<string, unknown>>((inner) => ({ type: 'group', nested: [inner] }), { type: 'property', properties: ['deep'] })] },
    'inline rows inside rows': { name: 'X', blocks: [Array.from({ length: 13 }).reduce<Record<string, unknown>>((inner) => ({ type: 'inline', heading: 'h', nested: [inner] }), { type: 'traits', properties: ['t'], heading: 'k', headingProp: true })] },
    'code where values belong': { name: 'X', blocks: [{ type: 'javascript', code: 42 }, { type: 'property', properties: ['p'], callback: { evil: true } }, { type: 'ifelse', conditions: 'yes' }] },
    'huge callbacks': { name: 'X', blocks: [{ type: 'property', properties: ['p'], callback: `return ${'monster.p + '.repeat(5000)}"";` }] },
  };

  it.each(Object.entries(hostile))('reads %s without throwing, into a template that parses', (_, value) => {
    const { template, report } = fsLayoutToTemplate(layoutFrom(value), { id: ID });
    expectParses(template);
    expect(report.withoutCode.full).toBeLessThanOrEqual(report.withoutCode.total);
  });

  it('says why it left blocks out', () => {
    const { report } = fsLayoutToTemplate(layoutFrom(hostile['items that are no blocks']), { id: ID });
    expect(report.dropped).toEqual([
      'Something in the layout that is not a block was left out.',
      'A block without a type was left out.',
    ]);
    const deep = fsLayoutToTemplate(layoutFrom(hostile['nesting far too deep']), { id: ID });
    expect(deep.report.dropped).toEqual(['Blocks nested more than 14 deep were left out.']);
    const unknown = fsLayoutToTemplate(layoutFrom({ name: 'X', blocks: [{ type: 'sparkle' }] }), { id: ID });
    expect(unknown.report.dropped).toEqual(['A block of the type "sparkle" was left out: Atlas does not know it.']);
  });

  it('accepts only what FS’s own import accepts as a layout', () => {
    expect(isFsLayout({ name: 'A', blocks: [] })).toBe(true);
    expect(isFsLayout({ name: 'A' })).toBe(false);
    expect(isFsLayout({ blocks: [] })).toBe(false);
    expect(isFsLayout([])).toBe(false);
    expect(isFsLayout('{"name":"A","blocks":[]}')).toBe(false);
  });
});

describe('the converter’s source', () => {
  it('never builds or evaluates code', () => {
    const folder = join(__dirname, '../../../../src/app/statblocks/fs');
    for (const file of readdirSync(folder).filter((name) => name.endsWith('.ts'))) {
      const source = readFileSync(join(folder, file), 'utf8');
      expect(source, file).not.toMatch(/\bnew\s+Function\b|\bFunction\s*\(|\beval\s*\(|\bimport\s*\(/);
    }
  });
});
