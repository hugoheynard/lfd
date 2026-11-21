import type { OrderReviews } from "../entities/order-reviews.js";

/**
 * Port de **lecture** du visa d'une commande, pour son détail : le même
 * registre que l'écriture charge, sans rien en écrire — c'est l'agrégat qui
 * dit si elle se vise (`reviewable`), par la même règle que le geste.
 */
export abstract class OrderReviewsReader {
  /** `null` : commande inconnue. */
  abstract of(orderId: string): Promise<OrderReviews | null>;
}

/** Le visa en cours d'une commande, pour une ligne de la liste. */
export interface CurrentOrderReview {
  readonly reviewedByStaffId: string;
  readonly reviewedAt: Date;
  readonly revisedSinceReview: boolean;
}

/**
 * Port de **lecture** des visas en cours d'une page de commandes — une
 * requête pour la page, pas une par ligne.
 */
export abstract class CurrentOrderReviewsReader {
  /** Seules les commandes visées sont dans la table rendue. */
  abstract of(orderIds: readonly string[]): Promise<ReadonlyMap<string, CurrentOrderReview>>;
}
