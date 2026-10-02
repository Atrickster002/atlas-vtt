/** The id of the element that holds the skin's SVG filters in a document. */
const HOST_ID = 'atlas-paint-filters';

interface Fray {
  id: string;
  /** Wavelength of the wobble: lower is a slower wave. */
  frequency: number;
  octaves: number;
  seed: number;
  /** How far the wobble moves a pixel. */
  scale: number;
}

/**
 * Armarium's fray filters: a pen that wavers. `fray` for small drawn boxes, `fray-soft` for
 * icons. Each turbulence has a fixed seed, so the same edge wobbles alike everywhere.
 */
const FRAYS: readonly Fray[] = [
  { id: 'atlas-fray', frequency: 0.11, octaves: 3, seed: 17, scale: 2.6 },
  { id: 'atlas-fray-soft', frequency: 0.075, octaves: 2, seed: 91, scale: 1.3 },
];

/** Puts the filters the skin's stylesheet names into the document, once. */
export function installPaintFilters(doc: Document): void {
  if (doc.getElementById(HOST_ID)) return;
  // The stylesheet takes the host out of the flow (`.atlas-paint-filters`).
  doc.body.createSvg('svg', { cls: 'atlas-paint-filters', attr: { id: HOST_ID, width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' } }, (host) => {
    host.createSvg('defs', undefined, (defs) => {
      for (const fray of FRAYS) {
        // The region is wide on purpose: the displacement moves pixels past the element's box.
        defs.createSvg('filter', { attr: { id: fray.id, x: '-35%', y: '-35%', width: '170%', height: '170%', 'color-interpolation-filters': 'sRGB' } }, (filter) => {
          filter.createSvg('feTurbulence', { attr: { type: 'fractalNoise', baseFrequency: fray.frequency, numOctaves: fray.octaves, seed: fray.seed, result: 'noise' } });
          filter.createSvg('feDisplacementMap', { attr: { in: 'SourceGraphic', in2: 'noise', scale: fray.scale, xChannelSelector: 'R', yChannelSelector: 'G' } });
        });
      }
    });
  });
}

export function removePaintFilters(doc: Document): void {
  doc.getElementById(HOST_ID)?.remove();
}
