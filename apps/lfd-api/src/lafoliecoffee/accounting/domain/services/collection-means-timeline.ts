import type { AppendOnlyStamp } from "../entities/billing-gesture.js";
import {
  DEFAULT_COLLECTION_MEANS,
  type CollectionMeans,
} from "../value-objects/collection-means.js";

/** Un segment du moyen d'un payeur, vivant ou annulé. */
export interface PayerMeansEntry extends AppendOnlyStamp {
  readonly means: CollectionMeans;
  readonly reason: string;
}

/** Le moyen qui fait foi à un instant, et depuis quand (`null` = défaut, jamais changé). */
export interface CollectionMeansInForce {
  readonly means: CollectionMeans;
  readonly since: Date | null;
}

/**
 * **Le moyen d'encaissement d'un payeur à `instant`** (V1, V3) — le dernier
 * segment vivant qui a pris effet à `instant` ou avant ; sans lui, le
 * prélèvement. C'est la lecture que la passation fera pour figer le moyen
 * d'une commande, d'après la période où elle tombe : un segment prend
 * toujours effet à une clôture du payeur (V2), donc une période n'a qu'un
 * moyen.
 */
export function collectionMeansAt(
  entries: readonly PayerMeansEntry[],
  instant: Date,
): CollectionMeansInForce {
  const inForce = entries
    .filter((entry) => entry.cancelledAt === null && entry.effectiveFrom <= instant)
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())
    .at(-1);
  return inForce === undefined
    ? { means: DEFAULT_COLLECTION_MEANS, since: null }
    : { means: inForce.means, since: inForce.effectiveFrom };
}
