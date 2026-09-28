import type { HandoverQueueView, ProductionPackingView } from '@lfd/contracts';

import type { QualityLookup, QualityRequest } from './quality-badges';
import type { QualityPanelData } from './quality-panel/quality-panel';
import { focusMatches } from './supervision-search';

/**
 * **Ce que le panneau Contrôler reprend de l'écran** (Supervision v2, A9) :
 * la pastille de la cible TELLE QU'AFFICHÉE — jamais un « OK » qui
 * contredirait la ligne —, et, pour une ligne du four, les enseignes des
 * commandes qui l'attendent, ce qu'un Bloquant retient.
 *
 * Une commande est visée par son id, alors que les pastilles sont rangées par
 * numéro : la file de retrait fait le lien. Absente de la file, pas de
 * pastille reprise — le panneau dit alors « Jamais contrôlé », ce qui est
 * faux au pire dans le sens prudent.
 */
export function qualityContextOf(
  request: QualityRequest,
  lookup: QualityLookup,
  packing: ProductionPackingView | null,
  handover: HandoverQueueView | null,
): Omit<QualityPanelData, 'serviceDay'> {
  const target = request.target;
  if (target.kind === 'line') {
    const awaited = focusMatches('oven', packing, handover, null).awaitedBy.get(target.sku);
    return {
      ...request,
      current: lookup.lines.get(target.sku) ?? null,
      awaitedBy: awaited ?? [],
    };
  }
  const reference = handover?.entries.find((entry) => entry.orderId === target.orderId)?.reference;
  return {
    ...request,
    current: reference === undefined ? null : (lookup.orders.get(reference) ?? null),
  };
}
