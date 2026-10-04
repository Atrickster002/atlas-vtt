import React from 'react';
import { StatblockSkeleton } from '../../../react/components/statblock/StatblockSkeleton';
import { EditorBar } from './EditorBar';
import type { EditorSession } from './sessionTypes';
import { TemplateEditor, type TemplateEditorProps } from './TemplateEditor';

/** Why the view has no session to edit. */
export type TemplateEditorProblem =
  /** The library has not read the file yet. */
  | { kind: 'loading' }
  /** The file is no template this Atlas can read. */
  | { kind: 'unreadable'; problems: readonly string[] }
  /** Another file holds the same template id. */
  | { kind: 'duplicate'; of: string }
  /** The `statblockEditor` experimental switch is off. */
  | { kind: 'off' };

export interface TemplateEditorSurfaceProps extends Omit<TemplateEditorProps, 'session'> {
  session: EditorSession | null;
  problem: TemplateEditorProblem | null;
  /**
   * Raised for each "select this block" request: the editor starts again with
   * that selection. The editor is kept by the view, never by the session, so
   * a session swapped under it (a built-in's copy) keeps what is selected.
   */
  selectRequest?: number | undefined;
}

function problemText(problem: Exclude<TemplateEditorProblem, { kind: 'loading' }>): string {
  if (problem.kind === 'off') return 'Turn on the statblock editor under Experimental features to edit templates.';
  if (problem.kind === 'duplicate') return `This file has the same template id as ${problem.of}. Edit that one, or delete this copy.`;
  return problem.problems[0] ? `This file can't be read as a statblock template: ${problem.problems[0]}` : "This file can't be read as a statblock template.";
}

/**
 * What the template editor's view shows (§4.6): the editor once its session
 * is open, a statblock-shaped skeleton while the library reads the file, or
 * why the file cannot be edited.
 */
export function TemplateEditorSurface({ session, problem, selectRequest = 0, ...props }: TemplateEditorSurfaceProps): React.JSX.Element {
  if (session) return <TemplateEditor key={selectRequest} session={session} {...props} />;
  if (!problem || problem.kind === 'loading') {
    return (
      <div className="atlas-te atlas-te--waiting">
        <StatblockSkeleton className="atlas-te-waiting-card" />
      </div>
    );
  }
  return (
    <div className="atlas-te atlas-te--waiting">
      <EditorBar tone="warning" text={problemText(problem)} />
    </div>
  );
}
