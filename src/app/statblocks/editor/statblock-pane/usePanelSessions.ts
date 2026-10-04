import { useCallback, useEffect, useRef } from 'react';
import type { App } from 'obsidian';
import { TemplateSession } from '../../library/TemplateSession';
import type { TemplateId } from '../../model/templateTypes';

export interface PanelSessions {
  /** The panel's hold on a template's session, opened on first use and kept, so its undo steps stay (§8.5). */
  hold: (id: TemplateId) => TemplateSession | null;
  /** Lets go of one hold: the template is about to go away. */
  drop: (id: TemplateId) => void;
}

/**
 * The template sessions the panel holds (spec §8.5): one per template it
 * changed, acquired on its first template action and released when the panel
 * goes, never per edit, so Mod+Z and the toast's Undo still find the step.
 */
export function usePanelSessions(app: App): PanelSessions {
  const held = useRef(new Map<TemplateId, TemplateSession>());

  useEffect(() => {
    const sessions = held.current;
    return () => {
      for (const session of sessions.values()) session.release();
      sessions.clear();
    };
  }, []);

  const hold = useCallback((id: TemplateId): TemplateSession | null => {
    const found = held.current.get(id);
    if (found) return found;
    const session = TemplateSession.open(app, id);
    if (session) held.current.set(id, session);
    return session;
  }, [app]);

  const drop = useCallback((id: TemplateId): void => {
    held.current.get(id)?.release();
    held.current.delete(id);
  }, []);

  return { hold, drop };
}
