import type { SitePaletteEntryView } from '@lfd/contracts';

import { methodLabel } from '../order-identity/order-identity';
import {
  logisticsCategoryOf,
  type LogisticsCategory,
  type LogisticsOrderFacts,
} from './logistics-category';

/** Ce qu'il faut savoir d'une commande pour dire son mode — plus le point figé. */
export interface FulfillmentModeFacts extends LogisticsOrderFacts {
  /** Le nom du point de retrait figé à la commande, ou `null`. */
  readonly pickupLabel: string | null;
}

/** La même chose sous le nom que portent les cartes de la Supervision (`method`). */
export type SupervisionModeFacts = Omit<FulfillmentModeFacts, 'fulfillmentMethod'> & {
  readonly method: FulfillmentModeFacts['fulfillmentMethod'];
};

/**
 * **Le mode d'une commande, à la couleur de sa catégorie logistique** (Hugo,
 * 2026-10-14 pour la liste des commandes, 2026-11-01 pour la Supervision) :
 * « Livraison », ou « Retrait <site> ». Le libellé est celui du MODE, sans la
 * clientèle, qu'un badge à côté dit déjà ; la couleur vient de
 * `logisticsCategoryOf`, qui seule sait la règle. Un retrait sans site connu
 * dit le nom du point figé (« Retrait Boutique »), sinon « Retrait » — en
 * teinte neutre dans les deux cas.
 */
export function fulfillmentModeOf(
  order: FulfillmentModeFacts,
  palette: readonly SitePaletteEntryView[],
): LogisticsCategory {
  const category = logisticsCategoryOf(order, palette);
  const method = methodLabel(order.fulfillmentMethod);
  if (order.fulfillmentMethod === 'delivery') {
    return { ...category, label: method };
  }
  // Le site d'abord ; à défaut, le nom du point FIGÉ (retraits sans `siteId`
  // dans le snapshot), toujours en teinte neutre puisque sans site.
  const place = palette.find((s) => s.id === order.siteId)?.label ?? order.pickupLabel;
  return { ...category, label: place === null ? method : `${method} ${place}` };
}
