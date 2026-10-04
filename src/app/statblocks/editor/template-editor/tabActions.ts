/** The template editor's tab edits (spec: Tabs): each one undo step, saying what it did in the live region. */

import { blockIdSource } from '../../model/templateIds';
import { collectBlockIds } from '../../model/treeQueries';
import { addTab, splitIntoTabs } from '../../model/treeTabs';
import { applyTree, outcomeOf, type EditOutcome } from './sessionEdit';
import type { EditorSession } from './sessionTypes';

/** Add tab: an empty tab at the end, selected, so it opens. */
export function addTabTo(session: EditorSession, tabsId: string): EditOutcome {
  const edit = applyTree(session, (layout) => addTab(layout, tabsId, blockIdSource(collectBlockIds(layout.blocks))));
  return outcomeOf(edit, session.getSnapshot(), (done) => ({ select: done.focus ? [done.focus] : undefined, announce: 'Added a tab.' }));
}

/** Split into tabs: the list becomes the first tab of a new Tabs block, with an empty second tab. */
export function splitListIntoTabs(session: EditorSession, listId: string): EditOutcome {
  const edit = applyTree(session, (layout) => splitIntoTabs(layout, listId, blockIdSource(collectBlockIds(layout.blocks))));
  return outcomeOf(edit, session.getSnapshot(), (done) => ({ select: done.focus ? [done.focus] : undefined, announce: 'Split into tabs.' }));
}
