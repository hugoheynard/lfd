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
 * **Le moyen d'encaissement d'un payeur à `instant`** (V1, V3') — le dernier
 * segment vivant qui a pris effet à `instant` ou avant ; sans lui, le
 * prélèvement. Lu au DÉBUT d'une période, c'est le moyen de toute la
 * période : un segment prend toujours effet à une clôture du payeur (V2, K1).
 * L'émission le fige sur la facture ; le lot le relit sur elle, ou sur la
 * période du solde d'un bon sans facture (K2, K9). Rien n'est figé sur la
 * commande.
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
