import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { borrowStage, resetStagePool, returnStage } from '../../../src/app/dice3d/stagePool';

describe('stagePool', () => {
  beforeEach(() => {
    // jsdom has no WebGL; silence three's report of the missing context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    resetStagePool();
    vi.restoreAllMocks();
  });

  it('creates a hidden canvas in the requested document, without a renderer where WebGL is missing', () => {
    const lease = borrowStage(document);
    expect(lease.renderer).toBeNull();
    expect(lease.canvas.ownerDocument).toBe(document);
    expect(lease.canvas.classList.contains('atlas-dice-stage__canvas')).toBe(true);
    expect(lease.canvas.getAttribute('aria-hidden')).toBe('true');
  });

  it('reuses a returned stage for the same document', () => {
    const lease = borrowStage(document);
    document.body.appendChild(lease.canvas);
    returnStage(lease);
    expect(lease.canvas.isConnected).toBe(false);
    expect(borrowStage(document)).toBe(lease);
    expect(borrowStage(document)).not.toBe(lease);
  });

  it('keeps a separate pool per document', () => {
    const popout = document.implementation.createHTMLDocument('popout');
    const lease = borrowStage(document);
    returnStage(lease);

    const other = borrowStage(popout);
    expect(other).not.toBe(lease);
    expect(other.canvas.ownerDocument).toBe(popout);
    expect(borrowStage(document)).toBe(lease);
  });
});
