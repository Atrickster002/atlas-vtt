import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, Plus, Settings2, Trash2 } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { useKeepInView } from '../../../../packages/components/primitives/useKeepInView';
import { observeResize } from '../../../../utils/observeResize';
import { cn } from '../../../../../utils/cn';
import { blockSpec } from '../../../model/blockCatalogue';
import type { TemplateBlock } from '../../../model/templateTypes';
import { CHROME_ATTRIBUTE } from '../../interaction/chrome';
import { PANEL_SCROLL_SELECTOR } from '../../panel-frame/panelSelectors';
import { blockFrame } from '../editorChrome';
import { blockGlyph } from '../editorGlyphs';
import type { ChromeStyle } from '../LabelEditor';
import { shortcutText } from '../shortcutText';
import { HIDDEN_TOOLBAR, placeBelow, type ToolbarPlacement } from './toolbarBelow';
import './selection-toolbar.scss';

export interface SelectionToolbarProps {
  /** The layer the toolbar is drawn in, over the whole editor. */
  layer: HTMLElement;
  /** The canvas stage holding the card. */
  stage: HTMLElement;
  block: TemplateBlock;
  /** How many blocks are selected: the toolbar then says "3 blocks". */
  count: number;
  editable: boolean;
  /** Whatever changes the block's place: re-measured when it changes. */
  revision: unknown;
  /** Whether any of the block's further settings is in use: a dot on Settings. */
  settingsInUse: boolean;
  /** Set for the Name or the token picture, which every statblock keeps: what the chip calls it. It neither turns into another block nor goes. */
  coreLabel: string | null;
  onTurnInto: (chip: HTMLElement) => void;
  onSettings?: (() => void) | undefined;
  onAddBelow: () => void;
  onDelete: () => void;
  onMore: (button: HTMLElement) => void;
  /** The block's menu is open: the toolbar keeps out of its way until it closes. */
  menuOpen: boolean;
  /** A right-click on the toolbar: the toolbar has no menu, so it opens the menu of the block under it. */
  onMenuBelow: (point: { x: number; y: number }) => void;
}

function measure(stage: HTMLElement, layer: HTMLElement, blockId: string, toolbar: HTMLElement | null): ToolbarPlacement {
  const frame = blockFrame(stage, blockId);
  const view = stage.closest(PANEL_SCROLL_SELECTOR) ?? stage;
  if (!frame || !toolbar) return HIDDEN_TOOLBAR;
  return placeBelow(frame.getBoundingClientRect(), view.getBoundingClientRect(), layer.getBoundingClientRect(), {
    width: toolbar.offsetWidth,
    height: toolbar.offsetHeight,
  });
}

/**
 * The selected block's toolbar (spec §4.2): exactly five controls, below the
 * block (above it only without room), in a layer over the editor, kept in
 * view. The type chip turns the block into another, Settings opens its
 * settings (a dot while any further setting is in use), then Add below,
 * Delete and More, which opens the block's menu. It stays shown and takes the
 * pointer over its whole capsule for as long as its block is selected, since
 * the way to it leads over the block below; it hands a right-click to the
 * block under it, hides while the block's menu is open, and never takes focus
 * from the block, so the block's keys keep working.
 */
export function SelectionToolbar(props: SelectionToolbarProps): React.JSX.Element {
  const { layer, stage, block, revision, editable } = props;
  const ref = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<ToolbarPlacement>(HIDDEN_TOOLBAR);
  const keepInView = useKeepInView(ref, !placement.hidden, placement.above ? 'top' : 'bottom', `${placement.left},${placement.top}`);

  useLayoutEffect(() => {
    const update = (): void => setPlacement(measure(stage, layer, block.id, ref.current));
    update();
    const scroller = stage.closest(PANEL_SCROLL_SELECTOR);
    scroller?.addEventListener('scroll', update, { passive: true });
    // The panel's body too: a bar opening above the card (a conflict) moves the block without resizing the stage, the layer or the scroller.
    const body = stage.closest<HTMLElement>('.atlas-sb-pane-body');
    const stop = observeResize([stage, layer, ...(scroller ? [scroller] : []), ...(body ? [body] : [])], update);
    return () => {
      scroller?.removeEventListener('scroll', update);
      stop();
    };
  }, [stage, layer, block.id, revision]);

  const style: React.CSSProperties & ChromeStyle = {
    ...keepInView.style,
    '--atlas-te-toolbar-x': `${placement.left}px`,
    '--atlas-te-toolbar-y': `${placement.top}px`,
  };
  const core = props.coreLabel !== null;
  const type = props.coreLabel ?? blockSpec(block.type).label;
  const Glyph = blockGlyph(block.type);
  const chipLabel = props.count > 1 ? `${props.count} blocks` : type;
  const turnable = editable && props.count === 1 && !core;

  return createPortal(
    <div
      ref={ref}
      className={cn('atlas-te-toolbar', keepInView.capped && 'atlas-keep-in-view--capped')}
      role="toolbar"
      aria-label={`${chipLabel} toolbar`}
      style={style}
      {...{ [CHROME_ATTRIBUTE]: '' }}
      data-hidden={placement.hidden || props.menuOpen || undefined}
      data-above={placement.above || undefined}
      // Focus stays on the block: its keys (Delete, arrows, Shift+F10) go on working after a click here.
      onMouseDown={(event) => event.preventDefault()}
      onContextMenu={(event) => {
        event.preventDefault();
        props.onMenuBelow({ x: event.clientX, y: event.clientY });
      }}
    >
      <LabelTooltip label={turnable ? `${type} · Turn into…` : chipLabel}>
        <Button
          variant="ghost"
          size="sm"
          className="atlas-te-toolbar__type"
          aria-disabled={!turnable || undefined}
          onClick={(event) => { if (turnable) props.onTurnInto(event.currentTarget); }}
        >
          <Glyph aria-hidden="true" />
          <span className="atlas-te-toolbar__type-name">{chipLabel}</span>
        </Button>
      </LabelTooltip>
      {props.onSettings && (
        <span className="atlas-te-toolbar__settings" data-in-use={props.settingsInUse || undefined}>
          <ToolButton icon={Settings2} label="Settings" shortcut={shortcutText(['Shift'], '⏎')} isActive={false} onClick={props.onSettings} />
        </span>
      )}
      <ToolButton icon={Plus} label="Add below" shortcut="/" isActive={false} disabled={!editable} onClick={props.onAddBelow} />
      {core
        ? <ToolButton icon={Trash2} label="Every statblock keeps this" isActive={false} disabled onClick={props.onDelete} />
        : <ToolButton icon={Trash2} label="Delete" shortcut="Del" isActive={false} disabled={!editable} onClick={props.onDelete} />}
      <span ref={more} className="atlas-te-toolbar__more">
        <ToolButton icon={Ellipsis} label="More" shortcut={shortcutText(['Shift'], 'F10')} isActive={false} onClick={() => { if (more.current) props.onMore(more.current); }} />
      </span>
    </div>,
    layer,
  );
}
