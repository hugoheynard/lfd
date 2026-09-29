import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Le style de la carte « Planifier » (lot 10 bis, L10b-C1) : relief ombré,
 * couverture du sol, eau, rues — repris de la maquette validée, couleurs
 * lues dans les tokens fold au moment de dessiner.
 *
 * Type-only sur `maplibre-gl` : ce fichier n'embarque rien, la bibliothèque
 * est chargée à la demande par la carte (L10b-C6).
 */

/** Les couleurs de la carte, résolues depuis les tokens fold (MapLibre ne lit pas `var()`). */
export interface MapPalette {
  readonly land: string;
  readonly wood: string;
  readonly grass: string;
  readonly ice: string;
  readonly built: string;
  readonly water: string;
  readonly road: string;
  readonly roadMajor: string;
  readonly shade: string;
  readonly light: string;
  readonly halo: string;
}

/** Le token fold de chaque couleur de la carte. */
export const MAP_PALETTE_TOKENS: Readonly<Record<keyof MapPalette, string>> = {
  land: '--fold-color-bg-page',
  wood: '--fold-color-success-surface',
  grass: '--fold-color-surface-sunken',
  ice: '--fold-color-surface-card',
  built: '--fold-color-surface-hover',
  water: '--fold-color-info-surface',
  road: '--fold-color-surface-card',
  roadMajor: '--fold-color-warning-surface',
  shade: '--fold-color-text',
  light: '--fold-color-surface-card',
  halo: '--fold-color-surface-card',
};

/** Une tournée à tracer : sa couleur résolue et sa géométrie `[lng, lat]`. */
export interface MapRoute {
  readonly color: string;
  readonly coordinates: readonly (readonly [number, number])[];
}

export const ROUTES_SOURCE = 'tournees';
const STREETS = 'rues';
const RELIEF = 'relief';

const HILLSHADE_EXAGGERATION = 0.5;
const HALO_WIDTH = 7;
const ROUTE_WIDTH = 3.5;
const HALO_OPACITY = 0.85;
const RELIEF_TILE_SIZE = 512;

/** Un tracé en GeoJSON — la seule forme que la carte pose. */
export interface RouteFeature {
  readonly type: 'Feature';
  readonly properties: { readonly color: string };
  readonly geometry: { readonly type: 'LineString'; readonly coordinates: [number, number][] };
}

export interface RoutesCollection {
  readonly type: 'FeatureCollection';
  readonly features: RouteFeature[];
}

/** La collection GeoJSON des tracés — une ligne par tournée qui en a un. */
export function routesGeoJson(routes: readonly MapRoute[]): RoutesCollection {
  return {
    type: 'FeatureCollection',
    features: routes
      .filter((route) => route.coordinates.length > 1)
      .map((route): RouteFeature => ({
        type: 'Feature',
        properties: { color: route.color },
        geometry: {
          type: 'LineString',
          coordinates: route.coordinates.map(([lng, lat]) => [lng, lat]),
        },
      })),
  };
}

function road(
  id: string,
  classes: readonly string[],
  width: number,
  color: string,
): LayerSpecification {
  return {
    id,
    type: 'line',
    source: STREETS,
    'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', [...classes]]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        9,
        width * 0.45,
        12,
        width * 1.1,
        14,
        width * 2.2,
      ],
    },
  };
}

/**
 * Le style complet. `streetsUrl` et `reliefUrl` sont les adresses `pmtiles://`
 * que le protocole enregistré sait servir.
 */
export function mapStyleOf(
  palette: MapPalette,
  streetsUrl: string,
  reliefUrl: string,
  routes: readonly MapRoute[],
): StyleSpecification {
  return {
    version: 8,
    sources: {
      [STREETS]: { type: 'vector', url: streetsUrl, attribution: '© contributeurs OpenStreetMap' },
      [RELIEF]: {
        type: 'raster-dem',
        url: reliefUrl,
        encoding: 'terrarium',
        tileSize: RELIEF_TILE_SIZE,
        attribution: '© Mapterhorn',
      },
      [ROUTES_SOURCE]: { type: 'geojson', data: routesGeoJson(routes) },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': palette.land } },
      {
        id: 'landcover',
        type: 'fill',
        source: STREETS,
        'source-layer': 'landcover',
        paint: {
          'fill-color': [
            'match',
            ['get', 'class'],
            'wood',
            palette.wood,
            'ice',
            palette.ice,
            'rock',
            palette.built,
            palette.grass,
          ],
        },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: STREETS,
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['residential', 'commercial', 'industrial']]],
        paint: { 'fill-color': palette.built },
      },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: RELIEF,
        paint: {
          'hillshade-shadow-color': palette.shade,
          'hillshade-highlight-color': palette.light,
          'hillshade-accent-color': palette.shade,
          'hillshade-exaggeration': HILLSHADE_EXAGGERATION,
        },
      },
      {
        id: 'water',
        type: 'fill',
        source: STREETS,
        'source-layer': 'water',
        paint: { 'fill-color': palette.water },
      },
      road('road-minor', ['minor', 'service', 'track'], 1.4, palette.road),
      road('road-secondary', ['tertiary', 'secondary'], 2.6, palette.road),
      road('road-primary', ['primary', 'trunk', 'motorway'], 3.6, palette.roadMajor),
      {
        id: 'halo',
        type: 'line',
        source: ROUTES_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': palette.halo,
          'line-width': HALO_WIDTH,
          'line-opacity': HALO_OPACITY,
        },
      },
      {
        id: 'routes',
        type: 'line',
        source: ROUTES_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ROUTE_WIDTH },
      },
    ],
  };
}
