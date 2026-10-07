import { InjectionToken } from '@angular/core';
import { ZONE_CLIENT_FRONT } from '@lfd/endpoints';

import type { MapTilesConfig } from './map-tiles.model';

/**
 * D'où la carte de l'écran « Planifier » lit ses tuiles
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, L10b-C6,
 * L10t-C4) — version **PRODUCTION**.
 *
 * Remplacée en développement par `map-tiles.config.dev.ts` (`fileReplacements`
 * d'`angular.json`, le même mécanisme que `api-config.ts`).
 *
 * En production, les deux fichiers (`rues.pmtiles`, `relief.pmtiles`) se lisent
 * **par plages** sous `/api/route-planner/tiles/` de la passerelle, sur la zone
 * — servis par `lfd-route-planner` depuis R2, sans jeton (lot 10 ter).
 *
 * ⚠️ L'adresse est ABSOLUE : le back-office est servi par Pages
 * (`lfd-backoffice.pages.dev`), pas par la zone — un chemin relatif tomberait
 * sur Pages. C'est donc un appel d'une AUTRE origine (relevé le 2026-09-29).
 * Si la carte ne se charge pas, l'écran le dit et les feuilles de route
 * restent.
 *
 * Un jeton plutôt qu'une constante : un test fournit la sienne, sans charger
 * MapLibre.
 */
export const MAP_TILES = new InjectionToken<MapTilesConfig>('MAP_TILES', {
  factory: () => ({ baseUrl: `${ZONE_CLIENT_FRONT}/api/route-planner/tiles/`, wholeFile: false }),
});
