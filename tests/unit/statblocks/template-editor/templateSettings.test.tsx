import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SRD_5_2_1_SOURCE } from '../../../../src/app/statblocks/presets/attributions';
import { FakeSession, sampleTemplate } from './editorKit';
import { key, mountEditor, settingsPanel, typeAndLeave } from './sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const settings = (): HTMLElement => settingsPanel();

/**
 * jsdom has no PointerEvent and no pointer capture: Radix reads the pointer's
 * position from the event and moves the slider only while its target holds it.
 */
function stubPointers(element: HTMLElement): void {
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  });
  let captured = false;
  element.setPointerCapture = (): void => { captured = true; };
  element.hasPointerCapture = (): boolean => captured;
  element.releasePointerCapture = (): void => { captured = false; };
}

describe('the template\'s settings', () => {
  it('show while nothing is selected, and edit the description and the columns one step each', () => {
    const session = new FakeSession(sampleTemplate());
    mountEditor(session);
    expect(settings().querySelector('.atlas-te-insp__name')?.textContent).toBe('Template');
    typeAndLeave(within(settings()).getByRole('textbox', { name: 'Description' }), 'For', 'For marsh creatures');
    expect(session.template.description).toBe('For marsh creatures');
    fireEvent.click(within(settings()).getByRole('radio', { name: '2' }));
    expect(session.template.layout.maxColumns).toBe(2);
    expect(session.steps).toBe(2);
    typeAndLeave(within(settings()).getByRole('textbox', { name: 'Description' }), '');
    expect(session.template).not.toHaveProperty('description');
  });

  it('sets the column width with the slider, one step a press, the default stored as none', () => {
    const session = new FakeSession(sampleTemplate());
    mountEditor(session);
    const thumb = within(settings()).getByRole('slider', { name: 'Column width' });
    expect(thumb.getAttribute('aria-valuenow')).toBe('22');
    key(thumb, 'ArrowRight');
    key(thumb, 'ArrowRight');
    expect(session.template.layout.columnWidth).toBe(24);
    expect(session.steps).toBe(2);
    key(thumb, 'ArrowLeft');
    key(thumb, 'ArrowLeft');
    expect(session.template.layout).not.toHaveProperty('columnWidth');
    expect(within(settings()).getByText('22 em')).toBeTruthy();
  });

  it('ends a press on the column width at the pointer\'s release, also where the width did not change', () => {
    const session = new FakeSession(sampleTemplate());
    mountEditor(session);
    const thumb = within(settings()).getByRole('slider', { name: 'Column width' });
    // 14 to 40 em over 260 px: 10 px an em, 22 em at 80 px.
    thumb.closest<HTMLElement>('.slider-root')!.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 260, 10);
    stubPointers(thumb);

    fireEvent.pointerDown(thumb, { button: 0, pointerId: 1, clientX: 80 });
    fireEvent.pointerUp(thumb, { pointerId: 1, clientX: 80 });
    fireEvent.click(within(settings()).getByRole('radio', { name: '2' }));
    expect(session.steps).toBe(1);
    session.undo();
    expect(session.template.layout.maxColumns).toBe(1);

    fireEvent.pointerDown(thumb, { button: 0, pointerId: 2, clientX: 80 });
    fireEvent.pointerMove(thumb, { pointerId: 2, clientX: 160 });
    expect(session.template.layout.columnWidth).toBe(30);
    fireEvent.pointerMove(thumb, { pointerId: 2, clientX: 80 });
    fireEvent.pointerUp(thumb, { pointerId: 2, clientX: 80 });
    expect(session.template.layout).not.toHaveProperty('columnWidth');
    fireEvent.click(within(settings()).getByRole('radio', { name: '3' }));
    expect(session.steps).toBe(3);
  });

  it('says that no role starts from a template, and what a copy is based on', () => {
    mountEditor(new FakeSession({ ...sampleTemplate(), derivedFrom: { templateId: 'builtin:5e-2024-monster', revision: 1 } }));
    expect(within(settings()).getByText(/^Nothing yet\./)).toBeTruthy();
    expect(within(settings()).getByText(/^Based on /).textContent).toMatch(/^Based on .+\.$/);
  });

  it('removes a licensed template\'s credit only after asking', () => {
    const session = new FakeSession({ ...sampleTemplate(), source: SRD_5_2_1_SOURCE });
    mountEditor(session);
    // One quiet line, which opens to the full credit; removing it is in there and asks first.
    expect(within(settings()).getByText(`Includes ${SRD_5_2_1_SOURCE.label}`)).toBeTruthy();
    expect(within(settings()).queryByText(SRD_5_2_1_SOURCE.attribution)).toBeNull();
    fireEvent.click(within(settings()).getByRole('button', { name: 'Read' }));
    expect(within(settings()).getByText(SRD_5_2_1_SOURCE.attribution)).toBeTruthy();
    fireEvent.click(within(settings()).getByRole('button', { name: 'Remove attribution…' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove attribution?' });
    expect(within(dialog).getByText(/asks for this credit wherever you share the template/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(session.template.source).toEqual(SRD_5_2_1_SOURCE);
    fireEvent.click(within(settings()).getByRole('button', { name: 'Remove attribution…' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove attribution?' })).getByRole('button', { name: 'Remove' }));
    expect(session.template).not.toHaveProperty('source');
    expect(session.steps).toBe(1);
  });
});
