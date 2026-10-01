import React, { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useIsPresent, type MotionStyle } from 'framer-motion';
import { Lightbulb, LightbulbOff, Trash2 } from 'lucide-react';
import { unitLabelFor } from '../../grid/measurementFormat';
import { editEmission } from '../../lighting/lightEmissionForm';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { maxLightRange } from '../../lighting/lightRanges';
import { Button } from '../../packages/components/primitives/button';
import { useAnchoredPopoverVariants } from '../../packages/components/primitives/dialogMotion';
import { Select } from '../../packages/components/primitives/Select';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { useAtlasStore, useViewStoreHook } from '../../react/ViewStoreContext';
import { useAtlasUI } from '../../react/root/AtlasUIContext';
import { AssetService } from '../../services/AssetService';
import { mapMeasurementSettings } from '../../services/mapMeasurementSettings';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { LightAnimation, LightEmission } from '../../types/lightingTypes';
import { SliderField } from './lightingPanelFields';
import { lightMarkerLook } from './lightMarker';
import { lightMarkerTheme } from './LightMarkers';
import { ColorSwatches, KindChips, RangeFields } from './lightPopoverFields';
import { useLightPopoverPosition } from './useLightPopoverPosition';

const FLICKERS: { value: LightAnimation; label: string }[] = [
  { value: 'none', label: 'Steady' },
  { value: 'torch', label: 'Torch' },
  { value: 'candle', label: 'Candle' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'magic', label: 'Shimmer' },
];

/** Keys the popover's controls use themselves; they must not reach the map's shortcuts (Tab, Space, arrows). */
const OWN_KEYS = new Set([' ', 'Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
const AT_REST = { hovered: false, selected: false, dragging: false };

const cssColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * The popover of the light the GM edits (store `lightPopover`), beside its marker on the map.
 * One popover: opening another light moves it there. The canvas draws that light's range rings
 * from the same store field (`LightRangeRings`).
 */
export function LightPopoverHost(): React.ReactElement {
  const lightId = useAtlasStore((state) => state.lightPopover);
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{lightId && <LightPopover key="light-popover" lightId={lightId} />}</AnimatePresence>
    </TooltipProvider>
  );
}

function LightPopover({ lightId }: { lightId: string }): React.ReactElement | null {
  const store = useViewStoreHook();
  const { app } = useAtlasUI();
  const assets = useMemo(() => AssetService.getInstance(app), [app]);
  const unitType = useAtlasStore((state) => mapMeasurementSettings(assets, state).unitType);
  const unitDistance = useAtlasStore((state) => mapMeasurementSettings(assets, state).unitDistance);
  const maxRange = useAtlasStore((state) => maxLightRange(unitScaleOf({ unitDistance }, state.grid)));
  const current = useAtlasStore((state) => state.objects.lights[lightId]);
  // While it leaves, the popover still shows the light it had, also when that light was deleted.
  const shown = useRef(current);
  if (current) shown.current = current;
  const light = shown.current;
  const ref = useRef<HTMLElement>(null);
  const flickerId = useId();
  const present = useIsPresent();
  const variants = useAnchoredPopoverVariants();
  useLightPopoverPosition(ref, lightId, unitDistance);
  useFocusWhileOpen(ref, present);

  // A slider drag writes on every move; the transaction makes the whole drag one undo step.
  // It ends on the window's pointerup, which comes even when the value did not change.
  const onSliderPointerDown = useCallback((event: React.PointerEvent): void => {
    beginHistoryTransaction(store);
    const win = event.currentTarget.ownerDocument.defaultView ?? window;
    const end = (): void => {
      win.removeEventListener('pointerup', end);
      win.removeEventListener('pointercancel', end);
      endHistoryTransaction(store);
    };
    win.addEventListener('pointerup', end);
    win.addEventListener('pointercancel', end);
  }, [store]);
  const beginPick = useCallback((): void => beginHistoryTransaction(store), [store]);
  const endPick = useCallback((): void => endHistoryTransaction(store), [store]);

  if (!light) return null;
  const emission = light.emission;
  const update = (next: LightEmission): void => {
    if (next !== emission) store.getState().updateLight(light.id, { emission: next });
  };
  const close = (): void => store.getState().closeLightPopover();
  // The chosen kind's chip is the marker in small: the theme's badge, glyph and ring in the light's colour.
  const theme = lightMarkerTheme();
  const look = lightMarkerLook({ ...light, hidden: false }, AT_REST, theme);
  const style = { '--atlas-light-badge': cssColor(theme.background), '--atlas-light-tint': cssColor(look.glyphTint) } as MotionStyle;

  return (
    <motion.section
      ref={ref}
      className="atlas-light-popover"
      style={style}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-label="Light"
      tabIndex={-1}
      inert={!present}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          // A list inside (the flicker select) closed itself with this key.
          if (!event.defaultPrevented) close();
        } else if (OWN_KEYS.has(event.key)) {
          event.stopPropagation();
        }
      }}
    >
      <KindChips emission={emission} onChange={update} />
      <div className="atlas-light-popover__section">
        <ColorSwatches color={emission.color} onChange={(color) => update({ ...emission, color })} onPickStart={beginPick} onPickEnd={endPick} />
      </div>
      <div className="atlas-light-popover__section">
        <RangeFields emission={emission} unit={unitLabelFor(unitType)} unitDistance={unitDistance} maxRange={maxRange} onChange={update} onSliderPointerDown={onSliderPointerDown} />
        <SliderField label="Intensity" value={emission.intensity} min={0} max={2} step={0.05} display={`${Math.round(emission.intensity * 100)} %`}
          onPointerDown={onSliderPointerDown} onChange={(value) => update(editEmission(emission, 'intensity', String(value)))} />
        <SliderField label="Softness" value={emission.sourceRadius ?? 1} min={0} max={5} step={0.25} display={String(emission.sourceRadius ?? 1)}
          onPointerDown={onSliderPointerDown} onChange={(value) => update(editEmission(emission, 'sourceRadius', String(value)))} />
        <div className="atlas-light-popover__flicker">
          <span id={flickerId}>Flicker</span>
          <Select value={emission.animation} options={FLICKERS} labelledBy={flickerId} onChange={(animation) => update({ ...emission, animation })} />
        </div>
      </div>
      <div className="atlas-light-popover__section atlas-light-popover__actions">
        <Button variant="ghost" size="sm" onClick={() => store.getState().updateLight(light.id, { hidden: !light.hidden })}>
          {light.hidden ? <Lightbulb /> : <LightbulbOff />}
          <span>{light.hidden ? 'Turn on' : 'Turn off'}</span>
        </Button>
        <Button variant="ghost" size="sm" className="atlas-light-popover__delete" onClick={() => store.getState().deleteLight(light.id)}>
          <Trash2 />
          <span>Delete</span>
        </Button>
      </div>
    </motion.section>
  );
}

/**
 * Focus moves into the popover when it opens (to the popover itself, so Tab reaches its first
 * control and no tooltip opens unasked), and back to where it was when the popover starts to leave.
 */
function useFocusWhileOpen(ref: React.RefObject<HTMLElement | null>, present: boolean): void {
  const before = useRef<Element | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (present) {
      before.current = element.ownerDocument.activeElement;
      element.focus({ preventScroll: true });
    } else if (before.current?.instanceOf(HTMLElement) && before.current.isConnected) {
      // `instanceOf`: in a popout window the element belongs to that window's classes.
      before.current.focus({ preventScroll: true });
    }
  }, [ref, present]);
}
