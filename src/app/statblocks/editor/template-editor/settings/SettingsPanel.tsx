import React, { useLayoutEffect, useRef, useState } from 'react';
import { observeResize } from '../../../../utils/observeResize';
import { PANEL_SCROLL_SELECTOR } from '../../panel-frame/panelSelectors';
import type { EditorWidth } from '../dock/dockPlacement';
import { FloatingPanel } from '../dock/FloatingPanel';
import { blockFrame } from '../editorChrome';
import { FadingInspectorBody } from '../inspector/InspectorBody';
import { primaryOf, type BlockSelection } from '../selection';
import { placeSettings, type Rect, type SettingsPlacement } from './settingsPlacement';
import '../inspector/inspector.scss';

export interface SettingsPanelProps {
  /** The editor's root, which the panel is placed in. */
  root: HTMLElement;
  /** The stage the card's blocks stand in. */
  stage: HTMLElement | null;
  selection: BlockSelection;
  /** What the panel is placed against again when it changes (the template). */
  revision: unknown;
  width: EditorWidth;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onClose: () => void;
}

type AnchorStyle = React.CSSProperties & Record<`--${string}`, string>;

function within(box: DOMRect, origin: DOMRect): Rect {
  return { left: box.left - origin.left, top: box.top - origin.top, right: box.right - origin.left, bottom: box.bottom - origin.top };
}

/**
 * The Settings panel (§2.7): the selected block's settings, or the template's
 * with nothing selected, floating over the note column beside the card, level
 * with the selected block. It glides to a newly selected block (its anchor
 * moves by transform) and swaps its contents; it does not close and reopen.
 */
export function SettingsPanel({ root, stage, selection, revision, width, pinned, onPinnedChange, onClose }: SettingsPanelProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<SettingsPlacement | null>(null);
  const primary = primaryOf(selection);

  useLayoutEffect(() => {
    const card = root.querySelector<HTMLElement>('.atlas-sb-pane-card');
    const scroller = card?.closest<HTMLElement>(PANEL_SCROLL_SELECTOR) ?? null;
    const update = (): void => {
      const panel = panelRef.current;
      if (!card || !panel) return;
      const origin = root.getBoundingClientRect();
      const frame = stage && primary ? blockFrame(stage, primary) : null;
      const dock = root.querySelector<HTMLElement>('.atlas-te-dock');
      const next = placeSettings({
        view: { left: 0, top: 0, right: origin.width, bottom: origin.height },
        card: within(card.getBoundingClientRect(), origin),
        block: frame ? within(frame.getBoundingClientRect(), origin) : null,
        height: panel.scrollHeight,
        dockRight: dock ? within(dock.getBoundingClientRect(), origin).right : 0,
        width,
      });
      setPlacement((was) => (was && was.left === next.left && was.top === next.top && was.maxHeight === next.maxHeight ? was : next));
    };
    update();
    scroller?.addEventListener('scroll', update, { passive: true });
    const stop = observeResize([root, ...(card ? [card] : []), ...(panelRef.current ? [panelRef.current] : [])], update);
    return () => {
      scroller?.removeEventListener('scroll', update);
      stop();
    };
  }, [root, stage, primary, revision, width]);

  const anchor: AnchorStyle = {
    transform: `translate(${placement?.left ?? 0}px, ${placement?.top ?? 0}px)`,
    '--atlas-te-settings-max-height': `${placement?.maxHeight ?? 0}px`,
  };

  return (
    <div className="atlas-te-settings-anchor" style={anchor} data-placed={placement ? '' : undefined}>
      <FloatingPanel
        ref={panelRef}
        className="atlas-te-settings atlas-te-insp"
        region="settings"
        label="Settings"
        pinned={pinned}
        onPinnedChange={onPinnedChange}
        onClose={onClose}
        from="left"
      >
        {(controls) => <FadingInspectorBody selection={selection} headerEnd={controls} />}
      </FloatingPanel>
    </div>
  );
}
