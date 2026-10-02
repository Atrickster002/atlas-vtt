import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAINT_ATTRIBUTE, PaintRuntime } from '../../src/app/skin/PaintRuntime';
import { paintKindOf } from '../../src/app/skin/paintRules';
import { resolveSkin, skinOfTheme } from '../../src/app/skin/skin';
import { stubLayout } from '../mocks/jsdomLayout';

stubLayout({ width: 240, height: 48 });

/** The next animation frame, when queued changes have been painted. */
const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

describe('PaintRuntime', () => {
  let runtime: PaintRuntime;

  beforeEach(() => {
    runtime = new PaintRuntime(document);
  });

  afterEach(() => {
    runtime.stop();
    document.body.empty();
  });

  it('hands a panel its silhouette as custom properties and adds no node', () => {
    const toolbar = document.body.createDiv({ cls: 'atlas-vtt-toolbar' });
    runtime.start();

    expect(toolbar.getAttribute(PAINT_ATTRIBUTE)).toBe('note');
    expect(toolbar.style.getPropertyValue('--atlas-paint-mask')).toContain('data:image/svg+xml');
    expect(toolbar.style.getPropertyValue('--atlas-paint-line')).toContain('data:image/svg+xml');
    expect(toolbar.style.getPropertyValue('--atlas-paint-out')).toBe('6px');
    expect(toolbar.childElementCount).toBe(0);
  });

  it('keeps the edge inside an element that scrolls or clips', () => {
    const menu = document.body.createDiv({ cls: 'atlas-ctx-menu' });
    menu.style.setProperty('overflow-y', 'auto');
    runtime.start();

    expect(menu.style.getPropertyValue('--atlas-paint-out')).toBe('0px');
    expect(menu.hasAttribute('data-atlas-paint-clipped')).toBe(true);
  });

  it('paints what is added later', async () => {
    runtime.start();
    const dialog = document.body.createDiv({ cls: 'atlas-modal' });
    await nextFrame();

    expect(dialog.getAttribute(PAINT_ATTRIBUTE)).toBe('sheet');
  });

  it('follows a control that is switched on and off', async () => {
    const tab = document.body.createEl('button', { cls: 'atlas-tab-button' });
    runtime.start();
    expect(tab.hasAttribute(PAINT_ATTRIBUTE)).toBe(false);

    tab.addClass('atlas-active');
    await nextFrame();
    expect(tab.getAttribute(PAINT_ATTRIBUTE)).toBe('brush');

    tab.removeClass('atlas-active');
    await nextFrame();
    expect(tab.hasAttribute(PAINT_ATTRIBUTE)).toBe(false);
    expect(tab.style.getPropertyValue('--atlas-paint-mask')).toBe('');
  });

  it('gives neighbours different shapes', () => {
    const first = document.body.createDiv({ cls: 'atlas-widget' });
    const second = document.body.createDiv({ cls: 'atlas-widget' });
    runtime.start();

    expect(first.style.getPropertyValue('--atlas-paint-mask')).not.toBe(second.style.getPropertyValue('--atlas-paint-mask'));
  });

  it('leaves nothing behind when the skin goes', () => {
    const toolbar = document.body.createDiv({ cls: 'atlas-vtt-toolbar' });
    runtime.start();
    runtime.stop();

    expect(toolbar.getAttributeNames().filter((name) => name.startsWith('data-atlas-paint'))).toEqual([]);
    expect(toolbar.getAttribute('style') ?? '').toBe('');
  });
});

describe('paint rules', () => {
  it('lets what is switched on win over the key it is', () => {
    const tool = document.body.createEl('button', { cls: 'btn btn--toolbar is-active' });
    expect(paintKindOf(tool)).toBe('brush');
    tool.remove();
  });

  it('paints nothing outside Atlas', () => {
    const note = document.body.createDiv({ cls: 'markdown-preview-view' });
    expect(paintKindOf(note)).toBeNull();
    note.remove();
  });
});

describe('the skin a document shows', () => {
  afterEach(() => {
    document.body.style.removeProperty('--atlas-skin');
  });

  it('is classic unless the theme asks for paper', () => {
    expect(skinOfTheme(document)).toBe('classic');
    document.body.style.setProperty('--atlas-skin', 'paper');
    expect(skinOfTheme(document)).toBe('paper');
  });

  it('follows the theme only when the setting says so', () => {
    document.body.style.setProperty('--atlas-skin', 'paper');
    expect(resolveSkin('theme', document)).toBe('paper');
    expect(resolveSkin('classic', document)).toBe('classic');
    document.body.style.removeProperty('--atlas-skin');
    expect(resolveSkin('paper', document)).toBe('paper');
  });
});
