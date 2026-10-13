import type { DriverTransferStopView, MyDeliveryStopView } from '@lfd/contracts';

/**
 * **Les arrêts de transfert dans « Ma tournée »** (plan du transfert interne,
 * lot T2) — hors de tout composant.
 *
 * Les deux listes ne parlent pas la même langue : un arrêt de commande porte
 * son `rank` 1..n PARMI LES COMMANDES, un arrêt de transfert sa `position`
 * dans la séquence ENTIÈRE de la tournée (lu le 2026-10-13 dans
 * `my-delivery-round-view.ts` et `delivery-transfers.ts`). Les positions étant
 * contiguës (I2), une place qu'aucun transfert n'occupe est celle de la
 * commande suivante.
 */

/** Une ligne de « Ma tournée » : une commande, ou un transfert. */
export type MyRoundEntry =
  | { readonly kind: 'order'; readonly stop: MyDeliveryStopView }
  | { readonly kind: 'transfer'; readonly stop: DriverTransferStopView };

/** Les deux listes, dans l'ordre de passage. */
export function interleavedStops(
  stops: readonly MyDeliveryStopView[],
  transfers: readonly DriverTransferStopView[],
): readonly MyRoundEntry[] {
  const byPosition = new Map(transfers.map((stop) => [stop.position, stop]));
  const entries: MyRoundEntry[] = [];
  const orders = [...stops].sort((a, b) => a.rank - b.rank);
  let next = 0;
  for (let position = 1; next < orders.length || byPosition.size > 0; position += 1) {
    const transfer = byPosition.get(position);
    if (transfer !== undefined) {
      entries.push({ kind: 'transfer', stop: transfer });
      byPosition.delete(position);
      continue;
    }
    const order = orders[next];
    if (order === undefined) {
      // Une position au-delà des commandes : les transferts restants, dans leur ordre.
      for (const rest of [...byPosition.values()].sort((a, b) => a.position - b.position)) {
        entries.push({ kind: 'transfer', stop: rest });
      }
      break;
    }
    entries.push({ kind: 'order', stop: order });
    next += 1;
  }
  return entries;
}

/** Les arrêts de transfert encore ouverts — « Remis au site » les clôt. */
export function openTransferStops(
  transfers: readonly DriverTransferStopView[],
): readonly DriverTransferStopView[] {
  return transfers.filter((stop) => stop.closedAt === null);
}

/** « → Val Village » — ce que dit « Tournée terminée » d'un transfert encore ouvert. */
export function transferStopLabel(stop: DriverTransferStopView): string {
  return `→ ${stop.siteLabel}`;
}
