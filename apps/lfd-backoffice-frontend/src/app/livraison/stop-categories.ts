import type { SitePaletteEntryView } from '@lfd/contracts';

import {
  type LogisticsCategory,
  logisticsCategoryOf,
} from '../shared/logistics-colors/logistics-category';

/**
 * **La catégorie de chaque arrêt de livraison, par arrêt** (plan
 * `commandes/plan-tri-depart-et-couleurs.md`, L1b) — la couleur de livraison
 * du site de départ pour la clientèle de sa commande. Un arrêt de transfert
 * n'y est pas : il mêle des clientèles.
 */
export function deliveryStopCategories(
  stops: readonly { readonly stopId: string; readonly clientele?: 'pro' | 'public' | undefined }[],
  palette: readonly SitePaletteEntryView[],
): ReadonlyMap<string, LogisticsCategory> {
  return new Map(
    stops.map((stop) => [
      stop.stopId,
      logisticsCategoryOf({ fulfillmentMethod: 'delivery', clientele: stop.clientele }, palette),
    ]),
  );
}
