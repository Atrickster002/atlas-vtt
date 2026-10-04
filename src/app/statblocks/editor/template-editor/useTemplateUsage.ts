import { useEffect, useState } from 'react';
import type { App, EventRef } from 'obsidian';
import { templateUsage, type TemplateUsage } from '../../library/templateUsage';
import type { TemplateId } from '../../model/templateTypes';

const NO_USAGE: TemplateUsage = { notes: [], roles: [] };
/** Notes change often while typing; the count follows after the metadata settles. */
const SETTLE_MS = 500;

function sameUsage(a: TemplateUsage, b: TemplateUsage): boolean {
  return a.notes.join('\n') === b.notes.join('\n')
    && a.roles.map((role) => `${role.collectionId}/${role.roleId}`).join('\n') === b.roles.map((role) => `${role.collectionId}/${role.roleId}`).join('\n');
}

/** What uses the template (§7.4: "Used by n statblocks"), read again whenever the metadata cache changes. */
export function useTemplateUsage(app: App | undefined, id: TemplateId): TemplateUsage {
  const [usage, setUsage] = useState<TemplateUsage>(NO_USAGE);
  useEffect(() => {
    if (!app) {
      setUsage(NO_USAGE);
      return undefined;
    }
    const read = (): void => {
      const next = templateUsage(app, id);
      setUsage((previous) => (sameUsage(previous, next) ? previous : next));
    };
    read();
    let timer = 0;
    const later = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, SETTLE_MS);
    };
    const cacheRefs: EventRef[] = [app.metadataCache.on('changed', later), app.metadataCache.on('deleted', later)];
    const renameRef = app.vault.on('rename', later);
    return () => {
      window.clearTimeout(timer);
      cacheRefs.forEach((ref) => app.metadataCache.offref(ref));
      app.vault.offref(renameRef);
    };
  }, [app, id]);
  return usage;
}
