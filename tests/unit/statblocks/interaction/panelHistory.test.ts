import { describe, expect, it, vi } from 'vitest';
import { PanelHistory, type TemplateStep } from '../../../../src/app/statblocks/editor/statblock-pane/panelHistory';
import { sampleTemplate } from '../template-editor/editorKit';

/** A template session's stand-in: undo and redo walk between two templates. */
function stepOver(): { step: TemplateStep; now: () => unknown; elsewhere: () => void } {
  const before = sampleTemplate();
  const after = { ...before, layout: { ...before.layout, blocks: before.layout.blocks.slice(1) } };
  let current = after;
  const step: TemplateStep = {
    current: () => current, before, after,
    undo: () => { current = before; }, redo: () => { current = after; },
  };
  return { step, now: () => current, elsewhere: () => { current = { ...after }; } };
}

/** The panel's undo (spec §8.5, G1): the newest of its own actions, in the history that took it. */
describe('PanelHistory', () => {
  it('sends the newest action to its own history: the note\'s, or the template\'s step', () => {
    const history = new PanelHistory();
    const { step, now } = stepOver();
    history.noteChanged();
    history.templateChanged(step);
    expect(history.undo()).toBe('template');
    expect(now()).toBe(step.before);
    expect(history.undo()).toBe('note');
    expect(history.undo()).toBe('nothing');
    expect(history.redo()).toBe('note');
    expect(history.redo()).toBe('template');
    expect(now()).toBe(step.after);
  });

  it('never undoes a template step another view made since: it says so and changes nothing', () => {
    const history = new PanelHistory();
    const { step, elsewhere, now } = stepOver();
    history.templateChanged(step);
    elsewhere();
    const changed = now();
    expect(history.undo()).toBe('elsewhere');
    expect(now()).toBe(changed);
  });

  it('takes back what else the action did, and cannot redo an action whose undo deleted the copy it made', () => {
    const history = new PanelHistory();
    const { step } = stepOver();
    const undoMore = vi.fn();
    history.templateChanged({ ...step, undoMore, once: true });
    expect(history.undo()).toBe('template');
    expect(undoMore).toHaveBeenCalledOnce();
    expect(history.redo()).toBe('nothing');
  });

  it('forgets what was undone once something new is done', () => {
    const history = new PanelHistory();
    history.noteChanged();
    history.undo();
    history.noteChanged();
    expect(history.redo()).toBe('nothing');
  });
});
