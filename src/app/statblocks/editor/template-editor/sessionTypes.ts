import type { TemplateSession } from '../../library/TemplateSession';

/**
 * What the template editor uses of a `TemplateSession`. Components take this
 * shape rather than the class, so a test drives them with a session of its own.
 */
export type EditorSession = Pick<
  TemplateSession,
  'getSnapshot' | 'subscribe' | 'apply' | 'beginGesture' | 'endGesture' | 'abandonGesture' | 'undo' | 'redo' | 'flush' | 'rename' | 'resolveConflict'
>;

export type { SaveState, SessionSnapshot } from '../../library/TemplateSession';
