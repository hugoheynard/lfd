import {
  DELIVERY_BIN_INNER_BAGS_MAX,
  DELIVERY_BINS_PER_DECLARATION_MAX,
  type DeclareTransferBinsPayload,
  type DeliveryLoadingTransferStopView,
} from '@lfd/contracts';

/**
 * **Les bacs d'un arrêt de transfert, vus du chargement** (plan du transfert
 * interne, lot T3). Hors de tout composant.
 */

/** « Arrêt 3 · 2 bacs, 1 chargé », ou ce qui manque pour partir. */
export function transferBinsSummary(stop: DeliveryLoadingTransferStopView): string {
  const live = stop.bins.length;
  const loaded = stop.bins.filter((bin) => bin.loadedAt !== null).length;
  const head = `Arrêt ${String(stop.position)} · transfert`;
  if (live === 0) {
    return `${head} · aucun bac déclaré : « Partir » le refuse`;
  }
  const bins = live === 1 ? '1 bac' : `${String(live)} bacs`;
  return `${head} · ${bins}, ${String(loaded)} chargé${loaded > 1 ? 's' : ''}`;
}

/**
 * La déclaration à envoyer, ou `null` tant qu'elle serait refusée : un format
 * choisi, 1 à 20 bacs, 0 à 50 sacs (le domaine revérifie les bornes).
 */
export function transferBinsPayload(
  binTypeId: string | null,
  count: number | null,
  innerBags: number | null,
): DeclareTransferBinsPayload | null {
  if (binTypeId === null || count === null || innerBags === null) {
    return null;
  }
  const countOk =
    Number.isInteger(count) && count >= 1 && count <= DELIVERY_BINS_PER_DECLARATION_MAX;
  const bagsOk =
    Number.isInteger(innerBags) && innerBags >= 0 && innerBags <= DELIVERY_BIN_INNER_BAGS_MAX;
  return countOk && bagsOk ? { binTypeId, count, innerBags } : null;
}
