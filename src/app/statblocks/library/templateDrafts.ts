/**
 * The drafts of open template sessions, as the library hands them out: a
 * saved entry with the draft in place of its template. The same entry object
 * comes back while neither changes, so readers that compare entries by
 * reference see a change only when there is one.
 */

import type { LibraryTemplate } from '../model/resolvedTypes';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';

interface Layered {
  saved: LibraryTemplate;
  entry: LibraryTemplate;
}

export class TemplateDrafts {
  private readonly drafts = new Map<TemplateId, StatblockTemplate>();
  private readonly layered = new Map<TemplateId, Layered>();

  /** Sets or (with null) forgets a draft; true when that changed anything. */
  set(id: TemplateId, draft: StatblockTemplate | null): boolean {
    if ((this.drafts.get(id) ?? null) === draft) return false;
    if (draft) this.drafts.set(id, draft);
    else this.drafts.delete(id);
    this.layered.delete(id);
    return true;
  }

  /** `saved` with the draft of its template in place, or `saved` itself without one. */
  layer(id: TemplateId, saved: LibraryTemplate | null): LibraryTemplate | null {
    const draft = this.drafts.get(id);
    if (!saved || !draft || draft === saved.template) return saved;
    const known = this.layered.get(id);
    if (known?.saved === saved) return known.entry;
    const entry = { ...saved, template: draft };
    this.layered.set(id, { saved, entry });
    return entry;
  }

  clear(): void {
    this.drafts.clear();
    this.layered.clear();
  }
}
