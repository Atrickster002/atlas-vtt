import type { Plugin } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { PaintRuntime } from '../skin/PaintRuntime';
import { PAPER_SKIN_CLASS, resolveSkin } from '../skin/skin';
import '../skin/styles/paper.scss';

/**
 * Keeps every Atlas document in the chosen skin: at start, when the setting changes, when
 * Obsidian's CSS changes (a theme switches the paper skin on) and when a window opens. A
 * document in the paper skin carries the skin's class on its body and a runtime that hands
 * its panels their torn edges.
 */
export function registerSkinSync(plugin: Plugin, settings: SettingsService): void {
  const runtimes = new Map<Document, PaintRuntime>();

  const apply = (doc: Document): void => {
    const paper = resolveSkin(settings.getSkin(), doc) === 'paper';
    doc.body.classList.toggle(PAPER_SKIN_CLASS, paper);
    const running = runtimes.get(doc);
    if (paper && !running) {
      const runtime = new PaintRuntime(doc);
      runtimes.set(doc, runtime);
      runtime.start();
    } else if (!paper && running) {
      running.stop();
      runtimes.delete(doc);
    }
  };

  const documents = (): Set<Document> => {
    const all = new Set<Document>([document]);
    plugin.app.workspace.iterateAllLeaves((leaf) => all.add(leaf.view.containerEl.ownerDocument));
    return all;
  };

  const applyAll = (): void => {
    const open = documents();
    for (const [doc, runtime] of runtimes) {
      if (open.has(doc)) continue;
      runtime.stop();
      runtimes.delete(doc);
    }
    open.forEach(apply);
  };

  plugin.app.workspace.onLayoutReady(applyAll);
  plugin.register(settings.onChange(applyAll));
  plugin.registerEvent(plugin.app.workspace.on('css-change', applyAll));
  plugin.registerEvent(plugin.app.workspace.on('window-open', (workspaceWindow) => apply(workspaceWindow.doc)));
  plugin.registerEvent(plugin.app.workspace.on('window-close', applyAll));
  // A popout takes its stylesheets a moment after it opens.
  plugin.registerEvent(plugin.app.workspace.on('layout-change', applyAll));
  plugin.register(() => {
    for (const [doc, runtime] of runtimes) {
      runtime.stop();
      doc.body.classList.remove(PAPER_SKIN_CLASS);
    }
    runtimes.clear();
  });
}
