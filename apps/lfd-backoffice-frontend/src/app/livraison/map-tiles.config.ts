import { InjectionToken } from '@angular/core';

import type { MapTilesConfig } from './map-tiles.model';

/**
 * D'où la carte de l'écran « Planifier » lit ses tuiles
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, L10b-C6) —
 * version **PRODUCTION**.
 *
 * Remplacée en développement par `map-tiles.config.dev.ts` (`fileReplacements`
 * d'`angular.json`, le même mécanisme que `api-config.ts`).
 *
 * En production, les deux fichiers (`rues.pmtiles`, `relief.pmtiles`) se lisent
 * **par plages** depuis `baseUrl`. Le bucket qui les servira n'existe pas
 * encore (question § 6-8 du plan) : l'URL est vide, la carte est absente,
 * l'écran le dit, et les feuilles de route marchent sans elle.
 *
 * Un jeton plutôt qu'une constante : un test fournit la sienne, sans charger
 * MapLibre.
 */
export const MAP_TILES = new InjectionToken<MapTilesConfig>('MAP_TILES', {
  factory: () => ({ baseUrl: '', wholeFile: false }),
});
