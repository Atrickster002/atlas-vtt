import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { ensureOwnCopy } from '../../../../src/app/statblocks/library/ownCopy';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { CopyOnWriteSession, type CopyOnWriteOptions } from '../../../../src/app/statblocks/editor/template-editor/copyOnWriteSession';
import { FakeSession, sampleTemplate } from './editorKit';

vi.mock('../../../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => ({ getDefaultCollectionId: () => 'default' }) } }));
vi.mock('../../../../src/app/statblocks/library/ownCopy', () => ({ ensureOwnCopy: vi.fn() }));
vi.mock('../../../../src/app/statblocks/library/TemplateSession', () => ({ TemplateSession: { open: vi.fn() } }));

const BUILT_IN = 'builtin:test-creature';

class Held extends FakeSession {
  released = false;
  release(): void { this.released = true; }
}

function setUp(copyExists = false): { builtIn: Held; copy: Held; session: CopyOnWriteSession; options: CopyOnWriteOptions } {
  const template = { ...sampleTemplate(), id: BUILT_IN };
  const builtIn = new Held(template, { readOnly: true, readOnlyReason: 'built-in', path: null, name: 'Test creature' });
  const copy = new Held({ ...template, id: 'test-creature-copy01' }, { name: 'Test creature copy' });
  vi.mocked(ensureOwnCopy).mockResolvedValue({ id: 'test-creature-copy01', path: 'atlas-vtt/statblock-templates/Test creature copy.atlastemplate', made: !copyExists });
  vi.mocked(TemplateSession.open).mockReturnValue(copy as unknown as TemplateSession);
  const options: CopyOnWriteOptions = {
    app: {} as App,
    collectionId: () => 'marsh',
    fromNote: () => 'Bestiary/Aboleth.md',
    switchNote: vi.fn(async () => true),
    onCopied: vi.fn(),
    notify: vi.fn(),
  };
  return { builtIn, copy, session: new CopyOnWriteSession(builtIn as unknown as TemplateSession, options), options };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const withoutFirst = (template: ReturnType<typeof sampleTemplate>): ReturnType<typeof sampleTemplate> =>
  ({ ...template, layout: { ...template.layout, blocks: template.layout.blocks.slice(1) } });

afterEach(() => vi.clearAllMocks());

/** A built-in in the template editor (spec §9.3, J7). */
describe('CopyOnWriteSession', () => {
  it('shows the built-in editable, and says where its first change goes', () => {
    const { session } = setUp();
    expect(session.getSnapshot()).toMatchObject({ readOnly: false, readOnlyReason: null, copyOnWrite: { builtInId: BUILT_IN, builtInName: 'Test creature' } });
    expect(session.getSnapshot()).toBe(session.getSnapshot());
  });

  it('makes the collection\'s copy on the first change and lands the change there as one step', async () => {
    const { builtIn, copy, session, options } = setUp();
    session.apply(withoutFirst);
    // At once: the editor shows the change before the copy exists.
    expect(session.getSnapshot().template.layout.blocks).toHaveLength(sampleTemplate().layout.blocks.length - 1);
    await settle();
    expect(ensureOwnCopy).toHaveBeenCalledWith(options.app, 'marsh', BUILT_IN);
    expect(copy.steps).toBe(1);
    expect(copy.template.layout.blocks).toHaveLength(sampleTemplate().layout.blocks.length - 1);
    expect(builtIn.template).toEqual({ ...sampleTemplate(), id: BUILT_IN });
    expect(session.getSnapshot().id).toBe('test-creature-copy01');
    expect(options.switchNote).toHaveBeenCalledWith('Bestiary/Aboleth.md', BUILT_IN, 'test-creature-copy01');
    expect(options.notify).toHaveBeenCalledWith('Made your own copy of Test creature. Aboleth uses it now.');
    expect(options.onCopied).toHaveBeenCalledTimes(1);
  });

  it('keeps a drag that began before the copy existed: the copy takes it, and the drop is one step', async () => {
    const { copy, session } = setUp();
    session.beginGesture();
    session.apply(withoutFirst);
    await settle();
    expect(copy.gestureOpen).toBe(true);
    session.apply(withoutFirst);
    session.endGesture();
    expect(copy.gestureOpen).toBe(false);
    expect(copy.steps).toBe(1);
    expect(copy.template.layout.blocks).toHaveLength(sampleTemplate().layout.blocks.length - 2);
  });

  it('makes nothing for an edit that changes nothing, or a gesture abandoned before the copy', async () => {
    const { session } = setUp();
    session.apply((template) => template);
    session.beginGesture();
    session.abandonGesture();
    await settle();
    expect(ensureOwnCopy).not.toHaveBeenCalled();
  });

  it('lets go of both sessions', async () => {
    const { builtIn, copy, session } = setUp();
    session.apply(withoutFirst);
    await settle();
    session.release();
    expect(builtIn.released && copy.released).toBe(true);
  });
});
