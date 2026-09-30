import { DiceRenderer } from './DiceRenderer';

/**
 * **The pool of stages: why the app survives many throws.**
 *
 * One WebGL context per throw sounds clean and was the most expensive line of
 * the whole application: the browser keeps only a handful at once, and a
 * returned one keeps counting until garbage collection collects it (the
 * measurement is noted at `DiceRenderer.reset`). On a phone the system reloads
 * the page under memory pressure instead of warning.
 *
 * So stages are borrowed, not built. A stage that leaves clears itself and
 * goes back into the pool; the next one takes it, canvas and all. Moving an
 * element costs the context nothing; only *throwing it away* did. The pool
 * therefore never grows beyond the number of stages that were ever on screen at
 * the same time (plus those fading out).
 *
 * **And it lives in its own module, not with the stage component**, so a hot
 * reload of the component does not drop it and pile up exactly the contexts
 * this is about.
 *
 * Atlas can show dice in the main window and in a pop-out window. A canvas and
 * its context belong to one document, so there is one pool per document.
 */

/** A canvas with a live context. `renderer` is null where there is no WebGL. */
export interface StageLease {
  canvas: HTMLCanvasElement;
  renderer: DiceRenderer | null;
}

let pools = new WeakMap<Document, StageLease[]>();

function poolOf(doc: Document): StageLease[] {
  let pool = pools.get(doc);
  if (pool === undefined) {
    pool = [];
    pools.set(doc, pool);
  }
  return pool;
}

export function borrowStage(doc: Document): StageLease {
  const free = poolOf(doc).pop();
  if (free !== undefined) return free;

  // Adopted before the context is created, so the canvas and its context
  // belong to the document it will be shown in.
  const canvas = doc.adoptNode(createEl('canvas', { cls: 'atlas-dice-stage__canvas', attr: { 'aria-hidden': 'true' } }));
  try {
    return { canvas, renderer: new DiceRenderer(canvas) };
  } catch {
    // No WebGL (jsdom, very old devices): the math runs, the picture is missing.
    return { canvas, renderer: null };
  }
}

export function returnStage(lease: StageLease): void {
  lease.canvas.remove();
  lease.renderer?.reset();
  poolOf(lease.canvas.ownerDocument).push(lease);
}

/** Tests only: empty the pools between two cases. */
export function resetStagePool(): void {
  pools = new WeakMap();
}
