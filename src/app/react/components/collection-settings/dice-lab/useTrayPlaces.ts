import { useLayoutEffect, useState, type RefObject } from 'react';
import { observeResize } from '../../../../utils/observeResize';

/** Where the open die lies in the tray's field, in px: its centre and its box. */
export interface DiePlace {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  /** Below its label. */
  bottom: number;
}

/** Where the step panel of the open die opens, in px of the field. */
export interface PanelPlace {
  left: number;
  top: number;
  /** No room under the die: the panel opens over it, where the fan was. */
  above: boolean;
}

/** Room between the die (or its label) and the panel, and the panel and the field's edge. */
const GAP = 8;

/**
 * The places of the open die and of the panel under it, measured from the
 * layout (offsets, never boxes: a die gliding to its new place is measured
 * where it lands) and again whenever the field changes size.
 */
export function useTrayPlaces(
  field: RefObject<HTMLDivElement | null>,
  panel: RefObject<HTMLDivElement | null>,
  openId: string | null,
  layoutKey: string,
): { die: DiePlace | null; panel: PanelPlace | null } {
  const [places, setPlaces] = useState<{ die: DiePlace | null; panel: PanelPlace | null }>({ die: null, panel: null });

  useLayoutEffect(() => {
    const host = field.current;
    if (!host || openId === null) {
      setPlaces({ die: null, panel: null });
      return;
    }
    const measure = (): void => {
      const die = host.querySelector<HTMLElement>(`[data-die="${openId}"]`);
      const cell = die?.parentElement;
      if (!die || !cell) return;
      const x = die.offsetLeft + die.offsetWidth / 2;
      const y = die.offsetTop + die.offsetHeight / 2;
      const top = die.offsetTop;
      const bottom = cell.offsetTop + cell.offsetHeight;
      const box = panel.current;
      let panelPlace: PanelPlace | null = null;
      if (box) {
        const width = box.offsetWidth;
        const height = box.offsetHeight;
        const left = Math.max(GAP, Math.min(host.clientWidth - width - GAP, x - width / 2));
        const above = bottom + GAP + height > host.scrollHeight - GAP && top - GAP - height >= GAP;
        panelPlace = { left, top: above ? top - GAP - height : bottom + GAP, above };
      }
      setPlaces({ die: { x, y, width: die.offsetWidth, height: die.offsetHeight, top, bottom }, panel: panelPlace });
    };
    measure();
    return observeResize([host], measure);
  }, [field, panel, openId, layoutKey]);

  return places;
}
