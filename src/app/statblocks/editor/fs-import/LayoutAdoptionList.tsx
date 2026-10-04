import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Notice, type App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { findLayout } from '../../../services/FantasyStatblocksService';
import { findImportedTemplate, importFsLayout, type FsLayoutImport } from '../../fs/fsImport';
import type { LayoutNotes } from '../../fs/fsLayoutNotes';
import { useTemplateLibrary } from '../../library/useTemplateLibrary';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import { plural } from '../../../utils/plural';
import { LayoutImportDialog } from './LayoutImportDialog';
import { useCollectionLayouts } from './useCollectionLayouts';

const NOT_IMPORTABLE = 'Turn on Fantasy Statblocks to import this layout';

interface Adopting {
  group: LayoutNotes;
  imported: FsLayoutImport;
}

/** The template a layout was imported as, as the batch names it. */
function asImport(entry: LibraryTemplate): FsLayoutImport | null {
  return entry.path ? { id: entry.template.id, name: entry.name, path: entry.path, report: null } : null;
}

/**
 * The Statblocks tab's Fantasy Statblocks layouts (§6.4, §9): each layout
 * that draws statblocks of the collection, with the template it gave, and
 * the batch that gives the layout's statblocks that template. A layout never
 * imported is imported first, which needs the plugin.
 */
export function LayoutAdoptionList({ app, collectionId }: { app: App; collectionId: string }): React.JSX.Element | null {
  const groups = useCollectionLayouts(app, collectionId);
  const library = useTemplateLibrary(app);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<Adopting | null>(null);
  // The dialog stays while its batch empties the list.
  if ((!groups || groups.length === 0) && !adopting) return null;

  const start = (group: LayoutNotes, imported: LibraryTemplate | null): void => {
    const ready = imported ? asImport(imported) : null;
    if (ready) {
      setAdopting({ group, imported: ready });
      return;
    }
    const layout = findLayout(app, group.layout.id) ?? findLayout(app, group.layout.name);
    if (!layout) return;
    setBusy(group.layout.name);
    importFsLayout(app, layout)
      .then((result) => setAdopting({ group, imported: result }))
      .catch((error: unknown) => {
        console.error('[Atlas] Importing a Fantasy Statblocks layout failed:', error);
        new Notice("Couldn't import the layout.");
      })
      .finally(() => setBusy(null));
  };

  return (
    <div ref={setRoot} className="atlas-csm-field atlas-sb-templates">
      <span className="atlas-csm-label">Fantasy Statblocks layouts</span>
      <p className="atlas-csm-hint">Statblocks of this collection drawn with a Fantasy Statblocks layout. Give them their layout&apos;s template to edit them in Atlas.</p>
      <ul className="atlas-sb-templates__list" aria-label="Fantasy Statblocks layouts">
        {(groups ?? []).map((group) => {
          const imported = library ? findImportedTemplate(library.templates, group.layout) : null;
          const importable = imported !== null || findLayout(app, group.layout.id) !== null || findLayout(app, group.layout.name) !== null;
          return (
            <li key={`${group.layout.id}\u0000${group.layout.name}`} className="atlas-sb-templates__row">
              <span className="atlas-sb-templates__name">{group.layout.name}</span>
              <span className="atlas-sb-templates__detail">{imported ? `Template: ${imported.name}` : 'Not imported yet'}</span>
              <span className="atlas-sb-templates__usage">{plural(group.notes.length, 'statblock')}</span>
              <LabelTooltip label={importable ? `Give them ${imported ? imported.name : 'the layout\'s template'}` : NOT_IMPORTABLE} describe>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-disabled={!importable || busy !== null ? true : undefined}
                  // Not `disabled`: a disabled button shows no tooltip, and this one says why.
                  onClick={importable && busy === null ? () => start(group, imported) : undefined}
                >
                  {busy === group.layout.name ? 'Importing…' : 'Use its template…'}
                </Button>
              </LabelTooltip>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {adopting && root && (
          <LayoutImportDialog
            key="layout-import"
            app={app}
            doc={root.doc}
            layout={adopting.group.layout}
            imported={adopting.imported}
            notes={adopting.group.notes}
            onClose={() => setAdopting(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
