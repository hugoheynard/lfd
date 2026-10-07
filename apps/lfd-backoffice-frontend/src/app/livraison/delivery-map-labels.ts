import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';

import type { MapPalette } from './delivery-map-style';

/**
 * **Les noms que dessine la carte « Planifier »** — rues, sommets, hameaux,
 * villages, villes — et les glyphes qui les écrivent. Sortis de
 * `delivery-map-style.ts`, qui assemble le style : ce sont les seules couches
 * qui dépendent des polices servies par le back-office.
 *
 * Type-only sur `maplibre-gl`, comme le style : rien n'est embarqué.
 */

/**
 * Les glyphes servis par le back-office (`public/map-glyphs/`, Noto Sans,
 * OFL) : les seules plages que portent nos noms — 0-255, 256-511, 8192-8447,
 * mesuré sur `rues.pmtiles` le 2026-09-29. Tilemaker n'y écrit que
 * `name:latin`, jamais `name`.
 */
export const GLYPHS_PATH = 'map-glyphs/';
const GLYPHS_TEMPLATE = '{fontstack}/{range}.pbf';
const FONT_REGULAR = 'Noto Sans Regular';
const FONT_BOLD = 'Noto Sans Bold';
const NAME: ExpressionSpecification = ['get', 'name:latin'];
const LABEL_HALO_WIDTH = 1.4;
const STREET_NAMES_MIN_ZOOM = 14;
const PEAK_NAMES_MIN_ZOOM = 12;
const HAMLET_NAMES_MIN_ZOOM = 12;
const VILLAGE_NAMES_MIN_ZOOM = 10;
/** Tailles en pixels : un cran par rang de lieu, les rues au plus petit. */
const SMALL_TEXT = 10;
const VILLAGE_TEXT = 11;
const TOWN_TEXT = 12;
const TOWN_LETTER_SPACING = 0.08;
const PEAK_OFFSET: [number, number] = [0, 0.6];

/** L'adresse des glyphes, absolue : MapLibre ne résout pas une URL relative. */
export function glyphsUrlOf(baseUri: string): string {
  return `${new URL(GLYPHS_PATH, baseUri).href}${GLYPHS_TEMPLATE}`;
}

/**
 * Les noms dessinés par la carte, sous les tracés : les repères d'arrêts sont
 * des marqueurs HTML, donc toujours au-dessus de toute couche du canevas.
 *
 * `source` est la source vectorielle des rues, que le style nomme.
 */
export function labelLayers(palette: MapPalette, source: string): LayerSpecification[] {
  const halo = { 'text-halo-color': palette.halo, 'text-halo-width': LABEL_HALO_WIDTH };
  return [
    {
      id: 'street-names',
      type: 'symbol',
      source,
      'source-layer': 'transportation_name',
      minzoom: STREET_NAMES_MIN_ZOOM,
      filter: ['has', 'name:latin'],
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': [FONT_REGULAR],
        'text-size': SMALL_TEXT,
      },
      paint: { 'text-color': palette.labelMinor, ...halo },
    },
    {
      id: 'peak-names',
      type: 'symbol',
      source,
      'source-layer': 'mountain_peak',
      minzoom: PEAK_NAMES_MIN_ZOOM,
      filter: ['has', 'name:latin'],
      layout: {
        'text-field': NAME,
        'text-font': [FONT_REGULAR],
        'text-size': SMALL_TEXT,
        'text-offset': PEAK_OFFSET,
        'text-anchor': 'top',
      },
      paint: { 'text-color': palette.labelMinor, ...halo },
    },
    {
      id: 'hamlet-names',
      type: 'symbol',
      source,
      'source-layer': 'place',
      minzoom: HAMLET_NAMES_MIN_ZOOM,
      filter: ['==', ['get', 'class'], 'hamlet'],
      layout: { 'text-field': NAME, 'text-font': [FONT_REGULAR], 'text-size': SMALL_TEXT },
      paint: { 'text-color': palette.labelMinor, ...halo },
    },
    {
      id: 'village-names',
      type: 'symbol',
      source,
      'source-layer': 'place',
      minzoom: VILLAGE_NAMES_MIN_ZOOM,
      filter: ['==', ['get', 'class'], 'village'],
      layout: { 'text-field': NAME, 'text-font': [FONT_REGULAR], 'text-size': VILLAGE_TEXT },
      paint: { 'text-color': palette.label, ...halo },
    },
    {
      id: 'town-names',
      type: 'symbol',
      source,
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: {
        'text-field': NAME,
        'text-font': [FONT_BOLD],
        'text-size': TOWN_TEXT,
        'text-transform': 'uppercase',
        'text-letter-spacing': TOWN_LETTER_SPACING,
      },
      paint: { 'text-color': palette.label, ...halo },
    },
  ];
}
