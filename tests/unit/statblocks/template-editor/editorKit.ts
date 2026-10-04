import type { EditorSession, SessionSnapshot } from '../../../../src/app/statblocks/editor/template-editor/sessionTypes';
import {
  TEMPLATE_FORMAT, TEMPLATE_VERSION, type StatblockTemplate, type TemplateBlock, type TemplateField,
} from '../../../../src/app/statblocks/model/templateTypes';

/**
 * A session with the contract's behaviour and nothing else: one undo step per
 * `apply` that changes the template, one per gesture, read-only refuses.
 */
export class FakeSession implements EditorSession {
  private snapshot: SessionSnapshot;
  private readonly past: StatblockTemplate[] = [];
  private future: StatblockTemplate[] = [];
  private readonly listeners = new Set<() => void>();
  private gestureStart: StatblockTemplate | null = null;
  private gestureDepth = 0;
  /** Calls of `apply` that changed the template. */
  steps = 0;
  readonly renames: string[] = [];
  readonly resolutions: string[] = [];
  flushes = 0;
  renameProblem: string | null = null;

  constructor(template: StatblockTemplate, options: Partial<Pick<SessionSnapshot, 'readOnly' | 'readOnlyReason' | 'name' | 'path' | 'saveState' | 'saveProblem' | 'conflict'>> = {}) {
    this.snapshot = {
      id: template.id,
      name: options.name ?? 'Test template',
      path: options.path === undefined ? 'atlas-vtt/statblock-templates/Test template.atlastemplate' : options.path,
      template,
      readOnly: options.readOnly ?? false,
      readOnlyReason: options.readOnlyReason ?? null,
      saveState: options.saveState ?? 'saved',
      saveProblem: options.saveProblem ?? null,
      conflict: options.conflict ?? null,
      canUndo: false,
      canRedo: false,
    };
  }

  get template(): StatblockTemplate {
    return this.snapshot.template;
  }

  /** Whether a gesture is open (a drag, a label being typed). */
  get gestureOpen(): boolean {
    return this.gestureDepth > 0;
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  apply(edit: (template: StatblockTemplate) => StatblockTemplate): void {
    if (this.snapshot.readOnly) return;
    const next = edit(this.snapshot.template);
    if (next === this.snapshot.template) return;
    if (this.gestureDepth === 0) {
      this.past.push(this.snapshot.template);
      this.steps += 1;
    }
    this.future = [];
    this.set(next);
  }

  beginGesture(): void {
    if (this.gestureDepth++ === 0) this.gestureStart = this.snapshot.template;
  }

  endGesture(): void {
    if (--this.gestureDepth > 0 || !this.gestureStart) return;
    if (this.gestureStart !== this.snapshot.template) {
      this.past.push(this.gestureStart);
      this.steps += 1;
    }
    this.gestureStart = null;
    this.set(this.snapshot.template);
  }

  abandonGesture(): void {
    const start = this.gestureStart;
    this.gestureDepth = 0;
    this.gestureStart = null;
    if (start) this.set(start);
  }

  undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.snapshot.template);
    this.set(previous);
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.snapshot.template);
    this.set(next);
  }

  flush(): Promise<void> {
    this.flushes += 1;
    return Promise.resolve();
  }

  rename(name: string): Promise<{ ok: true } | { ok: false; problem: string }> {
    this.renames.push(name);
    if (this.renameProblem) return Promise.resolve({ ok: false, problem: this.renameProblem });
    this.snapshot = { ...this.snapshot, name };
    this.emit();
    return Promise.resolve({ ok: true });
  }

  resolveConflict(choice: 'keep-mine' | 'use-other' | 'save-copy' | 'recreate'): Promise<void> {
    this.resolutions.push(choice);
    return Promise.resolve();
  }

  /** Changes what the snapshot says, as the session would after a save or a conflict. */
  patch(change: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.emit();
  }

  private set(template: StatblockTemplate): void {
    this.snapshot = { ...this.snapshot, template, canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

export function template(blocks: TemplateBlock[], fields: TemplateField[] = [], id = 'test-template-abc123'): StatblockTemplate {
  return { format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id, fields, layout: { maxColumns: 1, blocks } };
}

/** A small template: a title, a section "Defenses" with two stats, a row of two stacked stats, a divider. */
export function sampleTemplate(): StatblockTemplate {
  return template(
    [
      { id: 'title001', type: 'title', field: 'name', level: 1 },
      {
        id: 'section1', type: 'section', heading: 'Defenses', blocks: [
          { id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' },
          { id: 'stat-hp1', type: 'stat', field: 'hp', look: 'run-in' },
        ],
      },
      {
        id: 'row00001', type: 'row', blocks: [
          { id: 'stat-sp1', type: 'stat', field: 'speed', look: 'stacked' },
          { id: 'stat-cr1', type: 'stat', field: 'cr', look: 'stacked' },
        ],
      },
      { id: 'divider1', type: 'divider' },
    ],
    [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'ac', label: 'Armor class', type: 'number' },
      { key: 'hp', label: 'Hit points', type: 'number' },
      { key: 'speed', label: 'Speed', type: 'text' },
      { key: 'cr', label: 'Challenge', type: 'rating' },
    ],
  );
}

/** The ids of a layout's blocks, nested as the tree holds them: `row00001(stat-sp1 stat-cr1)`. */
export function shape(blocks: readonly TemplateBlock[]): string {
  return blocks.map((block) => ('blocks' in block ? `${block.id}(${shape(block.blocks)})` : block.id)).join(' ');
}
