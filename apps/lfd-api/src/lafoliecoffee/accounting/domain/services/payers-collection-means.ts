import {
  DEFAULT_COLLECTION_MEANS,
  type CollectionMeans,
} from "../value-objects/collection-means.js";
import { collectionMeansAt, type PayerMeansEntry } from "./collection-means-timeline.js";

/**
 * **Les moyens d'encaissement de plusieurs payeurs** d'une entité, lus une
 * fois (V4') : le moyen d'un payeur à un instant est `collectionMeansAt` sur
 * ses segments. Pur et immuable.
 */
export class PayersCollectionMeans {
  private constructor(private readonly byPayer: ReadonlyMap<string, readonly PayerMeansEntry[]>) {}

  static of(byPayer: ReadonlyMap<string, readonly PayerMeansEntry[]>): PayersCollectionMeans {
    return new PayersCollectionMeans(byPayer);
  }

  /** Aucun payeur n'a rien changé : tous au prélèvement, comme avant T1. */
  static none(): PayersCollectionMeans {
    return new PayersCollectionMeans(new Map());
  }

  /**
   * Le moyen de `payerId` à `instant`. Lu au DÉBUT d'une période, il est
   * celui de toute la période : un changement tombe toujours sur une
   * clôture du payeur (V3', K1).
   */
  at(payerId: string, instant: Date): CollectionMeans {
    const entries = this.byPayer.get(payerId);
    return entries === undefined
      ? DEFAULT_COLLECTION_MEANS
      : collectionMeansAt(entries, instant).means;
  }
}
