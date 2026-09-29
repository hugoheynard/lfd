import { InjectionToken } from '@angular/core';

import type { MapTilesConfig } from './map-tiles.model';

/**
 * Les tuiles de **DÉVELOPPEMENT** : le découpage Haute-Tarentaise, servi par le
 * back-office lui-même depuis `map-tiles/` (dossier ignoré par git, copié dans
 * les assets de la seule configuration `development`), et lu en entier.
 *
 * Sans les fichiers dans ce dossier, la carte dit qu'elle n'a pas pu se
 * charger ; les feuilles de route restent.
 */
export const MAP_TILES = new InjectionToken<MapTilesConfig>('MAP_TILES', {
  factory: () => ({ baseUrl: '/map-tiles/', wholeFile: true }),
});
