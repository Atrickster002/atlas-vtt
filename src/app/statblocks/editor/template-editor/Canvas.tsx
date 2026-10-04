import React, { useEffect, useMemo } from 'react';
import type { App } from 'obsidian';
import { MOTION_EASE_OUT, MOTION_NORMAL_MS, prefersReducedMotion } from '../../../utils/motion';
import type { StatblockTemplate } from '../../model/templateTypes';
import type { FieldRecord } from '../../values/fieldValues';
import { useCanvasKeyDrag } from '../dnd/useDragSources';
import { PanelCard } from '../panel-frame/PanelFrame';
import type { CanvasGap } from './canvasGaps';
import { ChromeLayer, SHEET_SELECTOR, type LabelEditing } from './ChromeLayer';
import { blockFrame, editorChrome, frameAt } from './editorChrome';
import { EDITOR_VALUE_EDITING } from './editorValueSlot';
import type { Box } from './gapGeometry';
import { primaryOf, withSibling, type BlockSelection } from './selection';
import { tabAt, withoutClosedTab } from './tabClicks';

/** Marks the elements whose focus the block keys act on (the canvas; the outline may carry it too). */
export const BLOCK_KEYS_SELECTOR = '[data-te-blocks]';

export interface CanvasProps {
  /** The stage the card and its chrome stand in; the editor finds blocks and anchors there. */
  stageRef: React.RefObject<HTMLDivElement | null>;
  app?: App | undefined;
  template: StatblockTemplate;
  templateName: string;
  /** Sample values, or the values of the statblock previewed with. */
  record: FieldRecord;
  sourcePath?: string | undefined;
  selection: BlockSelection;
  editable: boolean;
  label: LabelEditing | null;
  washId: string | null;
  onWashed: () => void;
  onSelect: (selection: BlockSelection) => void;
  onEditLabel: (id: string) => void;
  onInsertAt: (gap: CanvasGap, anchor: Box) => void;
  /** Focus moves to this block (the canvas itself for null) whenever the request's count changes. */
  focusRequest: { id: string | null; count: number };
  /** Shown instead of the card while the template has no block (Blank's ghost card). */
  empty?: React.ReactNode;
  /** The card at another surface's width (Show as a hover card, the DM screen); unset, the panel's. */
  shownWidth?: number | undefined;
  /** Empty headed sections folded into chips under the card, as the note view folds them (§8.2, J6). */
  folded?: ReadonlySet<string> | undefined;
}

/** A block just inserted fades in and rises 4 px (§7.6); only its opacity where motion is reduced. */
function playEntrance(frame: HTMLElement): void {
  const rise = !prefersReducedMotion(frame);
  frame.animate(
    [{ opacity: 0, ...(rise && { transform: 'translateY(4px)' }) }, { opacity: 1, ...(rise && { transform: 'translateY(0)' }) }],
    { duration: MOTION_NORMAL_MS, easing: MOTION_EASE_OUT },
  );
}

/**
 * The template editor's canvas (§7.4): the runtime card in the editing mode,
 * with values read-only. A click selects the innermost block, Shift+click
 * adds a sibling, a double click edits its label; its gutter handle (or
 * Space) moves it, a right-click opens its menu; links, dice and folds in
 * the card do nothing here. A tab opens on a click, and the tabs that hold
 * the selected block open with it.
 */
export function Canvas(props: CanvasProps): React.JSX.Element {
  const { stageRef, template, selection, onSelect, focusRequest, washId } = props;
  const chrome = useMemo(() => editorChrome(selection, template.fields), [selection, template.fields]);
  const isEmpty = template.layout.blocks.length === 0 && props.empty !== undefined;
  const primary = primaryOf(selection);
  // Only a block's handle drags it (§7.1); Space on a focused block picks it up for the arrow keys.
  const drag = useCanvasKeyDrag(stageRef, props.editable && !isEmpty);

  const focusTarget = (): HTMLElement | null => {
    const stage = stageRef.current;
    return stage && primary ? blockFrame(stage, primary) ?? stage : stage;
  };

  useEffect(() => {
    if (focusRequest.count === 0) return;
    const stage = stageRef.current;
    const target = stage && focusRequest.id ? blockFrame(stage, focusRequest.id) : stage;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [stageRef, focusRequest]);

  useEffect(() => {
    const stage = stageRef.current;
    const frame = stage && washId ? blockFrame(stage, washId) : null;
    if (frame) playEntrance(frame);
  }, [stageRef, washId]);

  const sheetOf = (): HTMLElement | null => stageRef.current?.querySelector<HTMLElement>(SHEET_SELECTOR) ?? null;

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target as Element;
    if (target.closest?.('.atlas-te-chrome')) return;
    const sheet = sheetOf();
    // A tab opens on its own click; a selection it hides is let go, so no key acts on what is out of sight.
    const tab = sheet ? tabAt(target, sheet) : null;
    if (tab) {
      const kept = withoutClosedTab(template.layout, selection, tab);
      if (kept !== selection) onSelect(kept);
      return;
    }
    // A Spells block's tabs open too, and the click selects the block.
    if (sheet?.contains(target) && !target.closest?.('[role="tab"]')) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (isEmpty && !sheet?.contains(target)) return;
    const frame = sheet ? frameAt(target, sheet) : null;
    const id = frame?.getAttribute('data-block-id') ?? null;
    if (!id) {
      onSelect([]);
      stageRef.current?.focus({ preventScroll: true });
      return;
    }
    onSelect(event.shiftKey ? withSibling(template.layout, selection, id) : [id]);
    frame?.focus({ preventScroll: true });
  };

  const onDoubleClickCapture = (event: React.MouseEvent<HTMLDivElement>): void => {
    const sheet = sheetOf();
    const frame = sheet ? frameAt(event.target, sheet) : null;
    // A tab's label is its Section's heading.
    const id = (sheet ? tabAt(event.target as Element, sheet)?.sectionId : null) ?? frame?.getAttribute('data-block-id');
    if (!id || event.shiftKey) return;
    event.preventDefault();
    props.onEditLabel(id);
  };

  // Tab never stops on a link or fold inside the card: focus coming in lands on the selected block.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>): void => {
    const sheet = sheetOf();
    const target = event.target;
    const from = event.relatedTarget;
    if (!sheet?.contains(target) || target.hasAttribute('data-block-id')) return;
    if (from && stageRef.current?.contains(from)) return;
    focusTarget()?.focus({ preventScroll: true });
  };

  const stage = (sheet: React.ReactNode): React.ReactNode => (
    <div
      ref={stageRef}
      className="atlas-te-stage"
      data-te-blocks=""
      data-te-region="canvas"
      tabIndex={primary || isEmpty ? -1 : 0}
      role="group"
      aria-label="Template canvas"
      onClickCapture={onClickCapture}
      onDoubleClickCapture={onDoubleClickCapture}
      onFocus={onFocus}
      onKeyDown={drag.onKeyDown}
    >
      {isEmpty ? props.empty : sheet}
      <ChromeLayer
        stageRef={stageRef}
        template={template}
        selection={selection}
        editable={props.editable && !isEmpty}
        label={props.label}
        washId={washId}
        onWashed={props.onWashed}
        onSelect={(id) => onSelect([id])}
        onInsertAt={props.onInsertAt}
      />
    </div>
  );

  // The card the note view draws, with the stage (the editor's chrome and events) around its sheet.
  return (
    <PanelCard
      chrome={chrome}
      valueEditing={EDITOR_VALUE_EDITING}
      template={template}
      name={props.templateName}
      record={props.record}
      app={props.app}
      sourcePath={props.sourcePath}
      shownWidth={props.shownWidth}
      folded={props.folded}
      reveal={primary}
      around={stage}
    />
  );
}
