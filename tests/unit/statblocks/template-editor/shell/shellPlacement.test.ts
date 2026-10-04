import { describe, expect, it } from 'vitest';
import {
  DOCK_PANEL_NARROW_WIDTH, DOCK_PANEL_WIDTH, PANEL_GAP, POPOVER_MAX_WIDTH, SETTINGS_WIDTH, dockPanelFit, dockYieldsToSettings, editorWidthOf,
} from '../../../../../src/app/statblocks/editor/template-editor/dock/dockPlacement';
import { placeSettings, type Rect } from '../../../../../src/app/statblocks/editor/template-editor/settings/settingsPlacement';
import { CAPSULE_FULL, capsuleFit, capsuleWidthAt, type CapsuleWidths } from '../../../../../src/app/statblocks/editor/template-editor/shell/capsuleFit';
import { showAsChoices, showAsLine, showAsWidth } from '../../../../../src/app/statblocks/editor/template-editor/shell/showAs';

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

describe('how the template editor\'s width shapes its floating panels', () => {
  it('is wide from 900 px, medium from 720 px, and stacked below, as a note view stacks', () => {
    expect(editorWidthOf(1400)).toBe('wide');
    expect(editorWidthOf(900)).toBe('wide');
    expect(editorWidthOf(899)).toBe('medium');
    expect(editorWidthOf(720)).toBe('medium');
    expect(editorWidthOf(719)).toBe('stacked');
    // Not measured yet: as wide as it gets.
    expect(editorWidthOf(0)).toBe('wide');
  });

  it('opens a dock panel beside the dock, narrowed where the note column is short, else as a popover', () => {
    expect(dockPanelFit(600, 'wide')).toEqual({ kind: 'beside', width: DOCK_PANEL_WIDTH });
    expect(dockPanelFit(310, 'wide')).toEqual({ kind: 'beside', width: DOCK_PANEL_NARROW_WIDTH });
    expect(dockPanelFit(250, 'medium')).toEqual({ kind: 'popover', width: DOCK_PANEL_NARROW_WIDTH });
    expect(dockPanelFit(700, 'stacked')).toEqual({ kind: 'popover', width: POPOVER_MAX_WIDTH });
  });

  it('lets the dock panel give way to Settings only where the two do not fit side by side', () => {
    expect(dockYieldsToSettings(700, 'wide')).toBe(false);
    expect(dockYieldsToSettings(600, 'wide')).toBe(true);
    expect(dockYieldsToSettings(700, 'medium')).toBe(true);
    expect(dockYieldsToSettings(0, 'medium')).toBe(false);
  });
});

describe('where the Settings panel stands', () => {
  const view = rect(0, 0, 1400, 900);
  const card = rect(700, 80, 1380, 860);

  it('stands left of the card, level with the selected block, never over the card', () => {
    const placed = placeSettings({ view, card, block: rect(720, 300, 1000, 330), height: 400, dockRight: 48, width: 'wide' });
    expect(placed.left + SETTINGS_WIDTH).toBe(card.left - PANEL_GAP);
    expect(placed.top).toBe(300);
  });

  it('stays inside the view below a block near its bottom, and with nothing selected stands level with the card', () => {
    expect(placeSettings({ view, card, block: rect(720, 800, 1000, 840), height: 400, dockRight: 48, width: 'wide' }).top).toBe(900 - PANEL_GAP - 400);
    expect(placeSettings({ view, card, block: null, height: 200, dockRight: 48, width: 'wide' }).top).toBe(card.top);
  });

  it('never covers the dock, and stands as a sheet at the foot of a stacked view, the card in sight above it', () => {
    const tight = placeSettings({ view: rect(0, 0, 800, 900), card: rect(300, 80, 780, 860), block: null, height: 100, dockRight: 48, width: 'medium' });
    expect(tight.left).toBe(48 + PANEL_GAP);
    const stacked = placeSettings({ view: rect(0, 0, 600, 900), card: rect(16, 80, 584, 500), block: rect(30, 120, 300, 150), height: 100, dockRight: 0, width: 'stacked' });
    expect(stacked).toEqual({ left: 30, top: 900 - PANEL_GAP - 100, maxHeight: 450 - PANEL_GAP });
    const tall = placeSettings({ view: rect(0, 0, 600, 900), card: rect(16, 80, 584, 500), block: null, height: 800, dockRight: 0, width: 'stacked' });
    expect(tall.top).toBe(900 - PANEL_GAP - (450 - PANEL_GAP));
  });
});

describe('the header capsule at narrow widths', () => {
  const widths: CapsuleWidths = { available: 1000, gap: 8, chip: 120, nameMin: 120, count: 150, showWith: 200, showWithIcon: 30, more: 30 };
  const full = capsuleWidthAt(widths, CAPSULE_FULL);

  it('shows every part where they fit, and never wraps: Show with folds to an icon, then the count, then the chip', () => {
    expect(capsuleFit({ ...widths, available: full })).toEqual(CAPSULE_FULL);
    expect(capsuleFit({ ...widths, available: full - 1 })).toEqual({ showWithIcon: true, countFolded: false, chipFolded: false });
    expect(capsuleFit({ ...widths, available: full - 170 - 158 })).toEqual({ showWithIcon: true, countFolded: true, chipFolded: false });
    expect(capsuleFit({ ...widths, available: 200 })).toEqual({ showWithIcon: true, countFolded: true, chipFolded: true });
  });

  it('leaves out the parts a capsule does not have', () => {
    expect(capsuleWidthAt({ ...widths, chip: 0, count: 0 }, CAPSULE_FULL)).toBe(120 + 200 + 30 + 2 * 8);
  });
});

describe('Show as', () => {
  it('offers the hover card and the DM screen as one where they are as wide', () => {
    expect(showAsChoices(1920).map((choice) => choice.label)).toEqual(['Note', 'Hover card and DM screen']);
    expect(showAsChoices(1280).map((choice) => choice.label)).toEqual(['Note', 'Hover card', 'DM screen']);
  });

  it('draws the card at that surface\'s width and says so under it', () => {
    expect(showAsWidth('note', 1280)).toBeUndefined();
    expect(showAsWidth('hover', 1280)).toBe(480);
    expect(showAsWidth('dm-screen', 1280)).toBe(540);
    expect(showAsLine('note', 1280)).toBeNull();
    expect(showAsLine('hover', 1280)).toBe('Shown as a hover card');
  });
});
