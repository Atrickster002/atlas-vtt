import React from 'react';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useTemplateEditor } from '../../../../src/app/statblocks/editor/template-editor/editorContext';
import { PatternEditor } from '../../../../src/app/statblocks/editor/template-editor/inspector/PatternEditor';
import { buildPatternLine, readPatternLine } from '../../../../src/app/statblocks/editor/template-editor/inspector/patternDom';
import { chipLook, openValueAt, patternPieces } from '../../../../src/app/statblocks/editor/template-editor/inspector/patternPieces';
import { patternPreview } from '../../../../src/app/statblocks/editor/template-editor/inspector/patternPreview';
import { editBlock } from '../../../../src/app/statblocks/editor/template-editor/inspector/blockEdits';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { fieldLabels } from '../../../../src/app/statblocks/values/fieldValues';
import { FakeSession, sampleTemplate, template } from './editorKit';
import { key, renderInEditor } from './sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const labels = fieldLabels([
  { key: 'hp', label: 'Hit points' },
  { key: 'stats', label: 'Abilities', slots: ['STR', 'DEX'] },
]);

describe('a pattern as text and chips', () => {
  it('cuts a pattern into text runs and values, escapes and unclosed braces staying text', () => {
    expect(patternPieces('{hp} ({hit_dice})')).toEqual([
      { kind: 'value', source: '{hp}' }, { kind: 'text', text: ' (' }, { kind: 'value', source: '{hit_dice}' }, { kind: 'text', text: ')' },
    ]);
    expect(patternPieces('AC \\{ac\\} [{aac}]')).toEqual([
      { kind: 'text', text: 'AC \\{ac\\} [' }, { kind: 'value', source: '{aac}' }, { kind: 'text', text: ']' },
    ]);
    expect(patternPieces('{a, b|join:\\}}x')).toEqual([{ kind: 'value', source: '{a, b|join:\\}}' }, { kind: 'text', text: 'x' }]);
    expect(patternPieces('{hp')).toEqual([{ kind: 'text', text: '{hp' }]);
    expect(patternPieces('{a {b}')).toEqual([{ kind: 'text', text: '{a ' }, { kind: 'value', source: '{b}' }]);
  });

  it('names a chip by its fields, its formula in words and its filters', () => {
    expect(chipLook('{hp}', labels)).toEqual({ label: 'Hit points', problem: false });
    expect(chipLook('{stats.1|signed}', labels)).toEqual({ label: 'DEX · signed', problem: false });
    expect(chipLook('{=floor((stats.1 - 10) / 2)|signed}', labels)).toEqual({ label: '= floor((DEX - 10) / 2) · signed', problem: false });
    expect(chipLook('{speed}', labels)).toEqual({ label: 'speed', problem: true });
    expect(chipLook('{hp|nope}', labels).problem).toBe(true);
  });

  it('finds the value being typed after an open brace', () => {
    expect(openValueAt('AC {ar', 6)).toBe(3);
    expect(openValueAt('AC {ac} x', 9)).toBe(-1);
    expect(openValueAt('AC \\{ar', 7)).toBe(-1);
    expect(openValueAt('AC \\\\{ar', 8)).toBe(5);
  });

  it('builds the editable line from the pattern and reads the very pattern back', () => {
    const line = document.body.createDiv();
    buildPatternLine(line, '{hp} of \\{max\\} [{speed}]', (source) => chipLook(source, labels));
    expect([...line.querySelectorAll('[data-source]')].map((chip) => chip.textContent)).toEqual(['Hit points', 'speed']);
    expect(line.querySelector('[data-source="{speed}"]')?.classList.contains('atlas-te-chip--problem')).toBe(true);
    expect(line.querySelector('[data-source]')?.getAttribute('contenteditable')).toBe('false');
    expect(readPatternLine(line)).toBe('{hp} of \\{max\\} [{speed}]');
    line.remove();
  });

  it('previews with the sample values and says what is wrong in plain words', () => {
    const base = sampleTemplate();
    expect(patternPreview('{ac} ({hp})', base)).toEqual({ text: '13 (22)', problem: null });
    expect(patternPreview('{=speed + 1}', base)?.problem).toBe('Speed isn\'t a number.');
    expect(patternPreview('{ac', base)?.problem).toBe('A “{” is never closed.');
    expect(patternPreview('  ', base)).toBeNull();
  });
});

function StatPattern({ session }: { session: FakeSession }): React.JSX.Element {
  const { snapshot } = useTemplateEditor();
  const block = findBlock(snapshot.template.layout.blocks, 'stat-ac1')?.block;
  const pattern = block?.type === 'stat' ? block.pattern ?? '' : '';
  return (
    <>
      <span id="pattern-label">Pattern</span>
      <PatternEditor labelledBy="pattern-label" value={pattern} session={session} disabled={false}
        onText={(text) => editBlock(session, 'stat-ac1', 'stat', { pattern: text || undefined })} />
    </>
  );
}

/** Puts `text` in the line and the caret at its end, as typing would, and says so. */
function typeInto(line: HTMLElement, text: string): void {
  const node = line.ownerDocument.createTextNode(text);
  line.append(node);
  const range = line.ownerDocument.createRange();
  range.setStart(node, text.length);
  range.collapse(true);
  const selection = line.ownerDocument.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.input(line);
}

describe('the pattern editor', () => {
  it('offers the fields after a brace and puts the chosen one in as a chip, all of it one step', () => {
    const session = new FakeSession(sampleTemplate());
    renderInEditor(session, <StatPattern session={session} />);
    const line = screen.getByRole('textbox', { name: 'Pattern' });
    act(() => line.focus());
    typeInto(line, 'AC {ar');
    const list = screen.getByRole('listbox', { name: 'Fields' });
    expect(within(list).getAllByRole('option').map((option) => option.querySelector('.atlas-te-choices__label')?.textContent)).toEqual(['Armor class']);
    key(line, 'Enter');
    expect(screen.queryByRole('listbox', { name: 'Fields' })).toBeNull();
    expect(line.querySelector('[data-source="{ac}"]')?.textContent).toBe('Armor class');
    expect(findBlock(session.template.layout.blocks, 'stat-ac1')?.block).toMatchObject({ pattern: 'AC {ac}' });
    fireEvent.blur(line);
    expect(session.steps).toBe(1);
    expect(screen.getByText('Shows “AC 13”')).toBeTruthy();
  });

  it('turns a value typed whole into a chip, and puts everything back with Escape', () => {
    const session = new FakeSession(template(
      [{ id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' }],
      [{ key: 'ac', label: 'Armor class', type: 'number' }, { key: 'aac', label: 'Ascending', type: 'number' }],
    ));
    renderInEditor(session, <StatPattern session={session} />);
    const line = screen.getByRole('textbox', { name: 'Pattern' });
    act(() => line.focus());
    typeInto(line, '{ac} [{aac}]');
    expect([...line.querySelectorAll('[data-source]')].map((chip) => chip.textContent)).toEqual(['Armor class', 'Ascending']);
    expect(findBlock(session.template.layout.blocks, 'stat-ac1')?.block).toMatchObject({ pattern: '{ac} [{aac}]' });
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { line.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(findBlock(session.template.layout.blocks, 'stat-ac1')?.block).not.toHaveProperty('pattern');
    expect(line.textContent).toBe('');
    expect(session.steps).toBe(0);
  });
});
